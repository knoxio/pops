//! Registry lifecycle: register-with-backoff on boot, a periodic heartbeat
//! loop, and a best-effort deregister on graceful shutdown.
//!
//! Faithful to the SDK's `registerWithRetry` + `startRuntime`
//! (`packages/pillar-sdk/src/bootstrap/{register,bootstrap}.ts`):
//!
//!   - register retries with exponential backoff (`min(initial * 2^(n-1), max)`),
//!     capped at `max_attempts`, but fails FAST on a non-retriable 4xx (a
//!     rejected manifest is not going to succeed on retry);
//!   - a `tokio::time::interval` fires a heartbeat every `heartbeat_ms`; a
//!     failed heartbeat is logged and the loop continues (a transient registry
//!     blip must not kill the pillar);
//!   - shutdown cancels the loop and deregisters best-effort.
//!
//! Crucially, **none of this crashes the pillar.** If registration exhausts its
//! retries the server still serves its HTTP surface; it is simply not yet a
//! registry member and will be re-registered by the next boot. The caller
//! spawns [`spawn_lifecycle`] as a detached task and serves regardless.

use std::sync::Arc;
use std::time::Duration;

use tokio::sync::Notify;
use tokio::task::JoinHandle;

use super::transport::{RegistryError, RegistryTransport};

/// Default heartbeat cadence — matches the SDK `DEFAULT_HEARTBEAT_MS` and core's
/// `HEARTBEAT_INTERVAL_MS`.
pub const DEFAULT_HEARTBEAT: Duration = Duration::from_secs(10);
/// Default register retry ceiling.
pub const DEFAULT_MAX_ATTEMPTS: u32 = 5;
/// First backoff step; doubles each attempt.
pub const DEFAULT_INITIAL_BACKOFF: Duration = Duration::from_secs(1);
/// Backoff ceiling.
pub const DEFAULT_MAX_BACKOFF: Duration = Duration::from_secs(30);

/// Tunables for the lifecycle. Defaults match the SDK; tests shrink the
/// backoff/cadence so they run instantly.
#[derive(Debug, Clone)]
pub struct LifecycleConfig {
    pub heartbeat: Duration,
    pub max_attempts: u32,
    pub initial_backoff: Duration,
    pub max_backoff: Duration,
}

impl Default for LifecycleConfig {
    fn default() -> Self {
        LifecycleConfig {
            heartbeat: DEFAULT_HEARTBEAT,
            max_attempts: DEFAULT_MAX_ATTEMPTS,
            initial_backoff: DEFAULT_INITIAL_BACKOFF,
            max_backoff: DEFAULT_MAX_BACKOFF,
        }
    }
}

/// The exponential backoff delay before the `attempt`-th retry (1-indexed):
/// `min(initial * 2^(attempt-1), max)`. Pure so the schedule is unit-testable.
pub fn backoff_delay(config: &LifecycleConfig, attempt: u32) -> Duration {
    let exponent = attempt.saturating_sub(1);
    let factor = 1_u64.checked_shl(exponent).unwrap_or(u64::MAX);
    let scaled = config
        .initial_backoff
        .checked_mul(factor.min(u32::MAX as u64) as u32)
        .unwrap_or(config.max_backoff);
    scaled.min(config.max_backoff)
}

/// Register, retrying transient failures with exponential backoff. Returns
/// `Ok(())` on the first success; `Err` once attempts are exhausted or a
/// non-retriable rejection is hit. Never panics.
pub async fn register_with_retry<T: RegistryTransport>(
    transport: &T,
    base_url: &str,
    manifest: &serde_json::Value,
    config: &LifecycleConfig,
) -> Result<(), RegistryError> {
    let mut attempt = 0;
    let mut last_err: Option<RegistryError> = None;

    while attempt < config.max_attempts {
        attempt += 1;
        match transport.register(base_url, manifest).await {
            Ok(()) => {
                tracing::info!(attempt, "registered with registry");
                return Ok(());
            }
            Err(err) => {
                if !err.retriable {
                    tracing::error!(
                        status = err.status,
                        error = %err,
                        "registry rejected the manifest (non-retriable) — not registering"
                    );
                    return Err(err);
                }
                if attempt >= config.max_attempts {
                    last_err = Some(err);
                    break;
                }
                let delay = backoff_delay(config, attempt);
                tracing::warn!(
                    attempt,
                    next_delay_ms = delay.as_millis() as u64,
                    error = %err,
                    "registration attempt failed, retrying"
                );
                last_err = Some(err);
                tokio::time::sleep(delay).await;
            }
        }
    }

    Err(last_err.unwrap_or_else(|| RegistryError {
        message: "registration exhausted attempts".to_string(),
        status: 0,
        retriable: true,
    }))
}

/// Handle to a running lifecycle task. Dropping it does NOT stop the loop;
/// call [`LifecycleHandle::stop`] for a graceful deregister + join.
pub struct LifecycleHandle {
    shutdown: Arc<Notify>,
    task: JoinHandle<()>,
}

impl LifecycleHandle {
    /// Signal the loop to stop, wait for it to deregister + exit. Idempotent in
    /// practice — the task ignores a second notify once it has exited.
    pub async fn stop(self) {
        self.shutdown.notify_one();
        let _ = self.task.await;
    }
}

/// Register (with backoff), then heartbeat forever. Returns only if the
/// heartbeat loop is somehow exited; in practice it runs until the caller's
/// `select!` shutdown branch cancels it. Split out so the cancellation point is
/// the single `select!` in [`spawn_lifecycle`].
async fn run_until_shutdown<T: RegistryTransport>(
    transport: &T,
    base_url: &str,
    manifest: &serde_json::Value,
    pillar_id: &str,
    config: &LifecycleConfig,
) {
    if let Err(err) = register_with_retry(transport, base_url, manifest, config).await {
        tracing::warn!(
            error = %err,
            "initial registration failed — serving anyway; heartbeats will re-establish membership"
        );
    }

    let mut ticker = tokio::time::interval(config.heartbeat);
    // The first tick fires immediately; skip it so we don't double up with the
    // register we just did.
    ticker.tick().await;

    loop {
        ticker.tick().await;
        if let Err(err) = transport.heartbeat(pillar_id).await {
            tracing::warn!(error = %err, "heartbeat failed (best-effort)");
        }
    }
}

/// Spawn the boot-register + heartbeat loop as a detached task.
///
/// The task first registers (with backoff). Whether or not registration
/// succeeds, it then enters the heartbeat loop — a pillar that failed to
/// register on the first boot still attempts heartbeats, and core's heartbeat
/// route soft-fails with `{ ok: false, reason: 'not-registered' }` so the loop
/// keeps the pillar visible the moment core comes back.
///
/// `transport` is shared (`Arc`) so the same resolver-cached paths are reused by
/// register, every heartbeat, and the shutdown deregister.
pub fn spawn_lifecycle<T>(
    transport: Arc<T>,
    base_url: String,
    manifest: serde_json::Value,
    pillar_id: String,
    config: LifecycleConfig,
) -> LifecycleHandle
where
    T: RegistryTransport + 'static,
{
    let shutdown = Arc::new(Notify::new());
    let task_shutdown = Arc::clone(&shutdown);

    let task = tokio::spawn(async move {
        // The whole register+heartbeat sequence races against shutdown so a
        // SIGTERM mid-backoff (registry still unreachable) aborts promptly and
        // proceeds straight to the best-effort deregister — shutdown latency is
        // bounded by one in-flight request, never the remaining backoff budget.
        tokio::select! {
            _ = run_until_shutdown(&*transport, &base_url, &manifest, &pillar_id, &config) => {}
            _ = task_shutdown.notified() => {}
        }

        if let Err(err) = transport.deregister(&pillar_id).await {
            tracing::warn!(error = %err, "deregister failed (best-effort)");
        }
    });

    LifecycleHandle { shutdown, task }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Mutex;

    fn fast_config() -> LifecycleConfig {
        LifecycleConfig {
            heartbeat: Duration::from_millis(5),
            max_attempts: 5,
            initial_backoff: Duration::from_millis(1),
            max_backoff: Duration::from_millis(4),
        }
    }

    #[test]
    fn backoff_doubles_then_caps() {
        let config = LifecycleConfig {
            initial_backoff: Duration::from_secs(1),
            max_backoff: Duration::from_secs(30),
            ..LifecycleConfig::default()
        };
        assert_eq!(backoff_delay(&config, 1), Duration::from_secs(1));
        assert_eq!(backoff_delay(&config, 2), Duration::from_secs(2));
        assert_eq!(backoff_delay(&config, 3), Duration::from_secs(4));
        assert_eq!(backoff_delay(&config, 4), Duration::from_secs(8));
        assert_eq!(backoff_delay(&config, 5), Duration::from_secs(16));
        assert_eq!(backoff_delay(&config, 6), Duration::from_secs(30));
        // Far out-of-range attempt never overflows; it saturates at the cap.
        assert_eq!(backoff_delay(&config, 200), Duration::from_secs(30));
    }

    /// Fake transport that fails register `fail_register_times` times (with the
    /// configured retriability) before succeeding, and records calls.
    struct FakeTransport {
        register_calls: AtomicU32,
        heartbeat_calls: AtomicU32,
        deregister_calls: AtomicU32,
        fail_register_times: u32,
        register_retriable: bool,
        last_base_url: Mutex<Option<String>>,
        last_manifest: Mutex<Option<serde_json::Value>>,
    }

    impl FakeTransport {
        fn new(fail_register_times: u32, register_retriable: bool) -> Self {
            FakeTransport {
                register_calls: AtomicU32::new(0),
                heartbeat_calls: AtomicU32::new(0),
                deregister_calls: AtomicU32::new(0),
                fail_register_times,
                register_retriable,
                last_base_url: Mutex::new(None),
                last_manifest: Mutex::new(None),
            }
        }
    }

    impl RegistryTransport for FakeTransport {
        async fn register(
            &self,
            base_url: &str,
            manifest: &serde_json::Value,
        ) -> Result<(), RegistryError> {
            *self.last_base_url.lock().unwrap() = Some(base_url.to_string());
            *self.last_manifest.lock().unwrap() = Some(manifest.clone());
            let n = self.register_calls.fetch_add(1, Ordering::SeqCst);
            if n < self.fail_register_times {
                return Err(RegistryError {
                    message: "boom".to_string(),
                    status: if self.register_retriable { 503 } else { 400 },
                    retriable: self.register_retriable,
                });
            }
            Ok(())
        }

        async fn heartbeat(&self, _pillar_id: &str) -> Result<(), RegistryError> {
            self.heartbeat_calls.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }

        async fn deregister(&self, _pillar_id: &str) -> Result<(), RegistryError> {
            self.deregister_calls.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }
    }

    #[tokio::test(start_paused = true)]
    async fn register_with_retry_succeeds_after_transient_failures() {
        let transport = FakeTransport::new(2, true);
        let manifest = serde_json::json!({ "pillar": "contacts" });
        register_with_retry(
            &transport,
            "http://localhost:3010",
            &manifest,
            &fast_config(),
        )
        .await
        .expect("third attempt succeeds");
        assert_eq!(transport.register_calls.load(Ordering::SeqCst), 3);
        assert_eq!(
            transport.last_base_url.lock().unwrap().as_deref(),
            Some("http://localhost:3010")
        );
        assert_eq!(
            transport.last_manifest.lock().unwrap().as_ref().unwrap()["pillar"],
            serde_json::json!("contacts")
        );
    }

    #[tokio::test(start_paused = true)]
    async fn register_with_retry_fails_fast_on_non_retriable_rejection() {
        let transport = FakeTransport::new(1, false);
        let manifest = serde_json::json!({ "pillar": "contacts" });
        let err = register_with_retry(
            &transport,
            "http://localhost:3010",
            &manifest,
            &fast_config(),
        )
        .await
        .expect_err("a 4xx rejection must not be retried");
        assert_eq!(err.status, 400);
        assert_eq!(
            transport.register_calls.load(Ordering::SeqCst),
            1,
            "a non-retriable rejection stops after one attempt"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn register_with_retry_gives_up_after_max_attempts() {
        let transport = FakeTransport::new(u32::MAX, true);
        let manifest = serde_json::json!({ "pillar": "contacts" });
        let err = register_with_retry(
            &transport,
            "http://localhost:3010",
            &manifest,
            &fast_config(),
        )
        .await
        .expect_err("permanent failure exhausts attempts");
        assert!(err.retriable);
        assert_eq!(transport.register_calls.load(Ordering::SeqCst), 5);
    }

    #[tokio::test]
    async fn lifecycle_registers_heartbeats_then_deregisters_on_stop() {
        let transport = Arc::new(FakeTransport::new(0, true));
        let handle = spawn_lifecycle(
            Arc::clone(&transport),
            "http://localhost:3010".to_string(),
            serde_json::json!({ "pillar": "contacts" }),
            "contacts".to_string(),
            fast_config(),
        );

        // Let a few heartbeats fire (5ms cadence).
        tokio::time::sleep(Duration::from_millis(40)).await;
        handle.stop().await;

        assert_eq!(transport.register_calls.load(Ordering::SeqCst), 1);
        assert!(
            transport.heartbeat_calls.load(Ordering::SeqCst) >= 1,
            "the heartbeat loop fired at least once"
        );
        assert_eq!(
            transport.deregister_calls.load(Ordering::SeqCst),
            1,
            "stop() deregisters exactly once"
        );
    }

    #[tokio::test]
    async fn lifecycle_still_heartbeats_when_initial_registration_fails() {
        // Permanent register failure, but the loop must keep heartbeating so the
        // pillar re-establishes membership the moment core recovers.
        let transport = Arc::new(FakeTransport::new(u32::MAX, true));
        let handle = spawn_lifecycle(
            Arc::clone(&transport),
            "http://localhost:3010".to_string(),
            serde_json::json!({ "pillar": "contacts" }),
            "contacts".to_string(),
            fast_config(),
        );
        tokio::time::sleep(Duration::from_millis(40)).await;
        handle.stop().await;

        assert_eq!(transport.register_calls.load(Ordering::SeqCst), 5);
        assert!(
            transport.heartbeat_calls.load(Ordering::SeqCst) >= 1,
            "heartbeats fire even after a failed registration"
        );
        assert_eq!(transport.deregister_calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn stop_during_register_backoff_deregisters_promptly() {
        // A retriable failure with a very long backoff: when stop() fires a few
        // ms in, the register loop is asleep mid-backoff. The select! against
        // shutdown must abort it and reach the deregister without waiting out
        // the (10s) backoff — otherwise SIGTERM handling would hang.
        let transport = Arc::new(FakeTransport::new(u32::MAX, true));
        let config = LifecycleConfig {
            heartbeat: Duration::from_secs(10),
            max_attempts: 5,
            initial_backoff: Duration::from_secs(10),
            max_backoff: Duration::from_secs(30),
        };
        let handle = spawn_lifecycle(
            Arc::clone(&transport),
            "http://localhost:3010".to_string(),
            serde_json::json!({ "pillar": "contacts" }),
            "contacts".to_string(),
            config,
        );

        tokio::time::sleep(Duration::from_millis(20)).await;
        // If stop() blocked on the backoff this would exceed the timeout.
        tokio::time::timeout(Duration::from_secs(1), handle.stop())
            .await
            .expect("stop() returns promptly even mid-backoff");

        assert_eq!(
            transport.deregister_calls.load(Ordering::SeqCst),
            1,
            "shutdown mid-backoff still deregisters"
        );
    }
}
