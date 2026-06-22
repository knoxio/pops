//! The HTTP leg of registry self-registration.
//!
//! ## Path resolution (slash-first, legacy fallback)
//!
//! One logical registry operation is reachable at two HTTP paths during the
//! `core→registry` rename's rolling-deploy window: the canonical slash form
//! (`/registry/register`) and the legacy dotted form (`/core.registry.register`).
//! This transport tries the canonical path first and falls back to the legacy
//! path on a **404 only** — a faithful port of the SDK's `resolveWithFallback`
//! (`packages/pillar-sdk/src/registry-path-resolver.ts`):
//!
//!   - 2xx → remember the winning path so steady state issues one request, and
//!     return.
//!   - 404 on the cached winner (e.g. core rolled back to legacy-only) →
//!     invalidate the hint and fall through to the other candidate IN THIS
//!     call, so a single 404 self-heals without a failed heartbeat.
//!   - any non-404 error (5xx / network) → surface immediately; "up but broken"
//!     is not "path unknown", so we do NOT try the other candidate.
//!
//! The cache is a hint shared across calls, guarded by a `Mutex` so the
//! concurrent heartbeat loop and a shutdown deregister never race on it.
//!
//! ## Retriability
//!
//! [`RegistryError::retriable`] is `true` for a network failure or a `>= 500`
//! response, `false` for a 4xx (a rejected manifest, a malformed pillar id).
//! The lifecycle uses this to fail fast on a non-retriable register rejection
//! and to back off on a transient one — matching the SDK's `register.ts`.

use std::future::Future;
use std::sync::Mutex;
use std::time::Duration;

use serde_json::Value;

/// Canonical (slash) registry paths — tried first.
pub const RESOLVER_PRIMARY_PATHS: RegistryPaths = RegistryPaths {
    register: "/registry/register",
    heartbeat: "/registry/heartbeat",
    deregister: "/registry/deregister",
};

/// Legacy (dotted, tRPC-vestigial) registry paths — the 404 fallback kept alive
/// across the rename's rolling-deploy window. These are what core mounts today.
pub const RESOLVER_LEGACY_PATHS: RegistryPaths = RegistryPaths {
    register: "/core.registry.register",
    heartbeat: "/core.registry.heartbeat",
    deregister: "/core.registry.deregister",
};

/// One path per registry operation.
#[derive(Debug, Clone, Copy)]
pub struct RegistryPaths {
    pub register: &'static str,
    pub heartbeat: &'static str,
    pub deregister: &'static str,
}

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(10);
const HTTP_NOT_FOUND: u16 = 404;

/// A registry transport error. Carries the wire status (0 for a transport-level
/// failure with no HTTP response) and whether the operation is worth retrying.
#[derive(Debug)]
pub struct RegistryError {
    pub message: String,
    /// HTTP status, or `0` when the request never produced a response.
    pub status: u16,
    /// `true` for a transient failure (network, 5xx); `false` for a 4xx.
    pub retriable: bool,
}

impl RegistryError {
    fn network(message: impl Into<String>) -> Self {
        RegistryError {
            message: message.into(),
            status: 0,
            retriable: true,
        }
    }

    fn from_status(path: &str, status: u16, body: &str) -> Self {
        RegistryError {
            message: format!("POST {path} → {status}: {body}"),
            status,
            retriable: status >= 500,
        }
    }

    fn is_not_found(&self) -> bool {
        self.status == HTTP_NOT_FOUND
    }
}

impl std::fmt::Display for RegistryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for RegistryError {}

/// Outcome of a heartbeat that reached the registry (HTTP 2xx).
///
/// Core's heartbeat route soft-fails with `{ ok: false, reason: 'not-registered' }`
/// at HTTP 200 when the pillar has no registration row (e.g. it was evicted, or
/// the initial register never succeeded). Distinguishing this from an
/// acknowledged heartbeat lets the lifecycle re-register instead of
/// heartbeating into the void forever.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HeartbeatOutcome {
    /// `{ ok: true, … }` — the registration is live.
    Acknowledged,
    /// `{ ok: false, reason: 'not-registered' }` — core has no row for us.
    NotRegistered,
}

/// The registry operations a pillar drives over its lifetime. A trait so the
/// lifecycle loop can be exercised against an in-process fake (the integration
/// tests) without a live core.
///
/// Methods return `impl Future + Send` (rather than the bare `async fn in
/// trait` sugar) because the lifecycle spawns the loop onto the tokio
/// multi-thread runtime, which requires the futures be `Send`.
pub trait RegistryTransport: Send + Sync {
    /// Register this pillar. `manifest` is the validated capability document;
    /// `base_url` is the origin core records for it.
    fn register(
        &self,
        base_url: &str,
        manifest: &Value,
    ) -> impl Future<Output = Result<(), RegistryError>> + Send;
    /// Report liveness for `pillar_id`. A transport error is a failure to
    /// reach/parse the registry; an `Ok(NotRegistered)` means core answered but
    /// has no row for us (re-register).
    fn heartbeat(
        &self,
        pillar_id: &str,
    ) -> impl Future<Output = Result<HeartbeatOutcome, RegistryError>> + Send;
    /// Drop `pillar_id`'s registration on graceful shutdown.
    fn deregister(&self, pillar_id: &str)
        -> impl Future<Output = Result<(), RegistryError>> + Send;
}

/// Cross-call resolver hint for ONE logical operation: the cached winning path
/// (if any) plus whether a winner was ever cached. Mirrors the SDK `ResolverLeg`.
#[derive(Debug)]
struct ResolverLeg {
    primary: &'static str,
    fallback: &'static str,
    resolved: Mutex<ResolverState>,
}

#[derive(Debug, Default)]
struct ResolverState {
    winner: Option<&'static str>,
    had_hint: bool,
}

impl ResolverLeg {
    fn new(primary: &'static str, fallback: &'static str) -> Self {
        ResolverLeg {
            primary,
            fallback,
            resolved: Mutex::new(ResolverState::default()),
        }
    }

    /// Candidate paths in try-order: the cached winner first (still keeping the
    /// other reachable so a single in-call 404 self-heals), else `[primary, fallback]`.
    fn candidates(&self) -> [&'static str; 2] {
        let state = self.resolved.lock().expect("resolver mutex not poisoned");
        match state.winner {
            Some(w) if w == self.fallback => [self.fallback, self.primary],
            _ => [self.primary, self.fallback],
        }
    }

    fn had_hint(&self) -> bool {
        self.resolved
            .lock()
            .expect("resolver mutex not poisoned")
            .had_hint
    }

    fn remember(&self, path: &'static str) {
        if path != self.primary && path != self.fallback {
            return;
        }
        let mut state = self.resolved.lock().expect("resolver mutex not poisoned");
        state.winner = Some(path);
        state.had_hint = true;
    }

    fn invalidate(&self) {
        let mut state = self.resolved.lock().expect("resolver mutex not poisoned");
        state.winner = None;
        state.had_hint = false;
    }
}

/// Run `send` across the leg's candidate paths with the self-healing
/// slash-first / legacy-fallback policy, returning the winning call's value.
async fn resolve_with_fallback<T, F, Fut>(leg: &ResolverLeg, send: F) -> Result<T, RegistryError>
where
    F: Fn(&'static str) -> Fut,
    Fut: std::future::Future<Output = Result<T, RegistryError>>,
{
    let candidates = leg.candidates();
    let last_index = candidates.len() - 1;
    let mut first_error: Option<RegistryError> = None;

    for (index, path) in candidates.iter().enumerate() {
        let is_last = index == last_index;
        match send(path).await {
            Ok(value) => {
                leg.remember(path);
                return Ok(value);
            }
            Err(err) => {
                if !err.is_not_found() || is_last {
                    return Err(err);
                }
                // 404 on the first candidate when a winner was cached on a
                // prior call → drop the hint so the cycle self-heals after a
                // core rollback, then fall through to the next candidate.
                if index == 0 && leg.had_hint() {
                    leg.invalidate();
                }
                if first_error.is_none() {
                    first_error = Some(err);
                }
            }
        }
    }

    Err(first_error
        .unwrap_or_else(|| RegistryError::network("registry resolver had no candidates")))
}

/// Production `reqwest`-backed transport. Holds one resolver leg per operation
/// so each caches its winning path independently across calls.
pub struct HttpRegistryTransport {
    base_url: String,
    client: reqwest::Client,
    register_leg: ResolverLeg,
    heartbeat_leg: ResolverLeg,
    deregister_leg: ResolverLeg,
}

impl HttpRegistryTransport {
    /// Build a transport against `base_url` (trailing slashes are stripped by
    /// the config resolver). A 10s per-request timeout prevents a hung TCP
    /// connection from blocking boot or shutdown indefinitely.
    pub fn new(base_url: impl Into<String>) -> Self {
        let client = reqwest::Client::builder()
            .timeout(DEFAULT_TIMEOUT)
            .build()
            .expect("reqwest client builds with a static timeout config");
        Self::with_client(base_url, client)
    }

    /// Build a transport with a caller-supplied client (tests inject a short
    /// timeout / no proxy).
    pub fn with_client(base_url: impl Into<String>, client: reqwest::Client) -> Self {
        HttpRegistryTransport {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            client,
            register_leg: ResolverLeg::new(
                RESOLVER_PRIMARY_PATHS.register,
                RESOLVER_LEGACY_PATHS.register,
            ),
            heartbeat_leg: ResolverLeg::new(
                RESOLVER_PRIMARY_PATHS.heartbeat,
                RESOLVER_LEGACY_PATHS.heartbeat,
            ),
            deregister_leg: ResolverLeg::new(
                RESOLVER_PRIMARY_PATHS.deregister,
                RESOLVER_LEGACY_PATHS.deregister,
            ),
        }
    }

    /// POST `body` to `path`; on a 2xx return the parsed JSON response body
    /// (`Value::Null` if it is empty/unparseable, which is fine for the callers
    /// that ignore the body). A non-2xx maps to a typed [`RegistryError`].
    async fn post(&self, path: &str, body: &Value) -> Result<Value, RegistryError> {
        let url = format!("{}{path}", self.base_url);
        let response = self
            .client
            .post(&url)
            .json(body)
            .send()
            .await
            .map_err(|err| RegistryError::network(format!("POST {path} failed: {err}")))?;

        let status = response.status().as_u16();
        let is_success = response.status().is_success();
        let text = response.text().await.unwrap_or_default();
        if is_success {
            return Ok(serde_json::from_str(&text).unwrap_or(Value::Null));
        }
        Err(RegistryError::from_status(path, status, &text))
    }
}

/// Parse a heartbeat response body into a [`HeartbeatOutcome`]. `ok: false`
/// (or a missing `ok`) is treated as not-registered; anything else is an ack.
fn heartbeat_outcome(body: &Value) -> HeartbeatOutcome {
    match body.get("ok").and_then(Value::as_bool) {
        Some(true) => HeartbeatOutcome::Acknowledged,
        _ => HeartbeatOutcome::NotRegistered,
    }
}

impl RegistryTransport for HttpRegistryTransport {
    async fn register(&self, base_url: &str, manifest: &Value) -> Result<(), RegistryError> {
        let body = serde_json::json!({
            "pillarId": "contacts",
            "baseUrl": base_url,
            "manifest": manifest,
        });
        resolve_with_fallback(&self.register_leg, |path| self.post(path, &body)).await?;
        Ok(())
    }

    async fn heartbeat(&self, pillar_id: &str) -> Result<HeartbeatOutcome, RegistryError> {
        let body = serde_json::json!({ "pillarId": pillar_id });
        let response =
            resolve_with_fallback(&self.heartbeat_leg, |path| self.post(path, &body)).await?;
        Ok(heartbeat_outcome(&response))
    }

    async fn deregister(&self, pillar_id: &str) -> Result<(), RegistryError> {
        let body = serde_json::json!({ "pillarId": pillar_id });
        resolve_with_fallback(&self.deregister_leg, |path| self.post(path, &body)).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn ok() -> Result<(), RegistryError> {
        Ok(())
    }

    fn not_found(path: &str) -> RegistryError {
        RegistryError::from_status(path, 404, "not found")
    }

    fn server_error(path: &str) -> RegistryError {
        RegistryError::from_status(path, 503, "down")
    }

    #[test]
    fn retriability_tracks_the_status_class() {
        assert!(RegistryError::network("x").retriable);
        assert!(server_error("/p").retriable);
        assert!(!not_found("/p").retriable);
        assert!(!RegistryError::from_status("/p", 400, "bad").retriable);
    }

    #[test]
    fn heartbeat_outcome_distinguishes_ack_from_not_registered() {
        assert_eq!(
            heartbeat_outcome(&serde_json::json!({ "ok": true, "pillarId": "contacts" })),
            HeartbeatOutcome::Acknowledged
        );
        assert_eq!(
            heartbeat_outcome(&serde_json::json!({ "ok": false, "reason": "not-registered" })),
            HeartbeatOutcome::NotRegistered
        );
        // A missing/odd body is treated conservatively as not-registered so the
        // lifecycle re-registers rather than assuming membership.
        assert_eq!(
            heartbeat_outcome(&Value::Null),
            HeartbeatOutcome::NotRegistered
        );
    }

    #[tokio::test]
    async fn prefers_the_primary_path_and_caches_it() {
        let leg = ResolverLeg::new("/registry/register", "/core.registry.register");
        let seen = RefCell::new(Vec::new());

        resolve_with_fallback(&leg, |path| {
            seen.borrow_mut().push(path);
            async move { ok() }
        })
        .await
        .expect("primary path succeeds");

        assert_eq!(*seen.borrow(), vec!["/registry/register"]);
        // The winner is cached: the next call tries it first.
        assert_eq!(leg.candidates()[0], "/registry/register");
    }

    #[tokio::test]
    async fn falls_back_to_legacy_on_404_then_caches_legacy() {
        let leg = ResolverLeg::new("/registry/register", "/core.registry.register");
        let seen = RefCell::new(Vec::new());

        resolve_with_fallback(&leg, |path| {
            seen.borrow_mut().push(path);
            async move {
                if path == "/registry/register" {
                    Err(not_found(path))
                } else {
                    ok()
                }
            }
        })
        .await
        .expect("legacy fallback succeeds");

        assert_eq!(
            *seen.borrow(),
            vec!["/registry/register", "/core.registry.register"],
            "tries canonical first, then legacy on 404"
        );
        // Legacy is now the cached winner — tried first next call.
        assert_eq!(leg.candidates()[0], "/core.registry.register");
    }

    #[tokio::test]
    async fn a_5xx_surfaces_immediately_without_trying_the_fallback() {
        let leg = ResolverLeg::new("/registry/register", "/core.registry.register");
        let seen = RefCell::new(Vec::new());

        let err = resolve_with_fallback(&leg, |path| {
            seen.borrow_mut().push(path);
            async move { Result::<(), RegistryError>::Err(server_error(path)) }
        })
        .await
        .expect_err("5xx is surfaced");

        assert_eq!(err.status, 503);
        assert!(err.retriable);
        assert_eq!(
            *seen.borrow(),
            vec!["/registry/register"],
            "a 5xx is not 'path unknown' — do not try the other candidate"
        );
    }

    #[tokio::test]
    async fn a_404_on_the_cached_winner_self_heals_in_call() {
        let leg = ResolverLeg::new("/registry/register", "/core.registry.register");
        // Prime the cache: canonical wins once.
        resolve_with_fallback(&leg, |_| async move { ok() })
            .await
            .unwrap();
        assert_eq!(leg.candidates()[0], "/registry/register");

        // Core rolls back to legacy-only: the cached canonical now 404s, the
        // call must fall through to legacy WITHIN the same invocation.
        let seen = RefCell::new(Vec::new());
        resolve_with_fallback(&leg, |path| {
            seen.borrow_mut().push(path);
            async move {
                if path == "/registry/register" {
                    Err(not_found(path))
                } else {
                    ok()
                }
            }
        })
        .await
        .expect("self-heals to legacy without a failed heartbeat");

        assert_eq!(
            *seen.borrow(),
            vec!["/registry/register", "/core.registry.register"]
        );
        assert_eq!(leg.candidates()[0], "/core.registry.register");
    }

    #[tokio::test]
    async fn a_404_from_both_candidates_surfaces_the_last_error() {
        let leg = ResolverLeg::new("/registry/register", "/core.registry.register");
        let err = resolve_with_fallback(&leg, |path| async move {
            Result::<(), RegistryError>::Err(not_found(path))
        })
        .await
        .expect_err("both 404 → error");
        assert!(err.is_not_found());
    }
}
