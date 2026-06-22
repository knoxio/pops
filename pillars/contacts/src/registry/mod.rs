//! Registry self-registration for the contacts pillar — the reference Rust
//! implementation of the lifecycle every TS pillar runs via
//! `@pops/pillar-sdk`'s `bootstrapPillar`.
//!
//! Three pieces:
//!
//!   - [`transport`] — the HTTP leg: POST the register / heartbeat / deregister
//!     envelopes, trying the canonical slash path first and falling back to the
//!     legacy dotted path on a 404 (a faithful port of the SDK's
//!     `resolveWithFallback` self-healing resolver).
//!   - [`lifecycle`] — register-with-backoff on boot, a 10s heartbeat loop, and
//!     a best-effort deregister on graceful shutdown. Never crashes the pillar:
//!     a briefly-unavailable registry retries, and a permanently-unavailable one
//!     leaves the server serving its surface regardless.
//!   - manifest version coercion ([`coerce_manifest_version`]) mirroring the
//!     SDK's `coerceManifestVersion` so a Watchtower-injected git SHA becomes a
//!     valid semver prerelease instead of failing manifest validation.

pub mod lifecycle;
pub mod transport;

pub use lifecycle::{spawn_lifecycle, LifecycleHandle};
pub use transport::{
    HeartbeatOutcome, HttpRegistryTransport, RegistryError, RegistryTransport,
    RESOLVER_LEGACY_PATHS, RESOLVER_PRIMARY_PATHS,
};

/// Whether `version` is accepted by the manifest schema's `SEMVER` rule
/// (`packages/pillar-sdk/src/manifest-schema/schema.ts`):
/// `^\d+\.\d+\.\d+(-[a-z0-9.]+)?$`.
///
/// This is INTENTIONALLY stricter than full semver — the manifest validator
/// rejects `+build` metadata and any uppercase in the prerelease, so a value
/// this returns `true` for is guaranteed to pass register-time validation. A
/// looser check would let `1.0.0+build.5` through, core would reject the
/// manifest with a non-retriable 400, and contacts would never register.
fn is_manifest_semver(version: &str) -> bool {
    let (core, pre) = match version.split_once('-') {
        Some((core, pre)) => (core, Some(pre)),
        None => (version, None),
    };

    let mut parts = core.splitn(3, '.');
    let (Some(major), Some(minor), Some(patch), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return false;
    };
    if !is_all_digits(major) || !is_all_digits(minor) || !is_all_digits(patch) {
        return false;
    }

    // Prerelease (if present) must be non-empty `[a-z0-9.]` — no uppercase, no
    // `+build` metadata (which would have ended up here as part of `pre`).
    match pre {
        None => true,
        Some(pre) => {
            !pre.is_empty()
                && pre
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.')
        }
    }
}

fn is_all_digits(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|b| b.is_ascii_digit())
}

/// Coerce a raw `BUILD_VERSION` into a MANIFEST-valid semver.
///
/// Watchtower-driven deploys inject the git SHA as `BUILD_VERSION`, but the
/// manifest schema requires semver. Rather than fail register, a value the
/// validator would reject becomes `0.0.0-sha.<sanitized first 7 chars>` — a
/// guaranteed-valid prerelease. Already-valid values pass through unchanged.
/// Mirrors the SDK's `coerceManifestVersion`, tightened so the result always
/// satisfies the manifest `SEMVER` rule (the prerelease suffix is lowercased
/// and stripped to `[a-z0-9.]`, so even a branch-name `BUILD_VERSION` like
/// `Feature/X` cannot produce an invalid manifest).
pub fn coerce_manifest_version(raw: &str) -> String {
    if is_manifest_semver(raw) {
        return raw.to_string();
    }
    let sanitized: String = raw
        .chars()
        .take(7)
        .map(|c| c.to_ascii_lowercase())
        .map(|c| {
            if c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' {
                c
            } else {
                '0'
            }
        })
        .collect();
    let suffix = if sanitized.is_empty() {
        "unknown".to_string()
    } else {
        sanitized
    };
    format!("0.0.0-sha.{suffix}")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The manifest schema's `SEMVER` regex, replicated so the test asserts
    /// `coerce_manifest_version`'s output is genuinely accepted by it.
    fn matches_manifest_semver_regex(v: &str) -> bool {
        let (core, pre) = match v.split_once('-') {
            Some((c, p)) => (c, Some(p)),
            None => (v, None),
        };
        let nums: Vec<&str> = core.split('.').collect();
        if nums.len() != 3
            || !nums
                .iter()
                .all(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
        {
            return false;
        }
        match pre {
            None => true,
            Some(p) => {
                !p.is_empty()
                    && p.bytes()
                        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.')
            }
        }
    }

    #[test]
    fn manifest_semver_values_pass_through_unchanged() {
        assert_eq!(coerce_manifest_version("1.2.3"), "1.2.3");
        assert_eq!(
            coerce_manifest_version("0.0.0-sha.abcdef0"),
            "0.0.0-sha.abcdef0"
        );
        assert_eq!(coerce_manifest_version("2.0.0-rc.1"), "2.0.0-rc.1");
    }

    #[test]
    fn a_git_sha_is_coerced_to_a_manifest_valid_prerelease() {
        assert_eq!(coerce_manifest_version("deadbeefcafe"), "0.0.0-sha.deadbee");
        // Short SHA shorter than 7 chars keeps its full length.
        assert_eq!(coerce_manifest_version("abc"), "0.0.0-sha.abc");
    }

    #[test]
    fn the_dev_default_is_manifest_semver_and_is_coerced() {
        // `0.0.0-dev` IS manifest-valid (prerelease `dev`), so it passes through.
        assert_eq!(coerce_manifest_version("0.0.0-dev"), "0.0.0-dev");
        // A bare `dev` is not semver.
        assert_eq!(coerce_manifest_version("dev"), "0.0.0-sha.dev");
    }

    #[test]
    fn build_metadata_is_not_manifest_semver_and_is_coerced() {
        // The manifest SEMVER regex rejects `+build` metadata, so passing
        // `1.0.0+build.5` through verbatim would make core reject the manifest.
        // It must be coerced instead.
        assert!(!is_manifest_semver("1.0.0+build.5"));
        // First 7 chars "1.0.0+b" lowercased with `+` → `0`: "1.0.00b".
        assert_eq!(
            coerce_manifest_version("1.0.0+build.5"),
            "0.0.0-sha.1.0.00b"
        );
    }

    #[test]
    fn is_manifest_semver_matches_the_schema_regex() {
        assert!(!is_manifest_semver("v1.2.3"));
        assert!(!is_manifest_semver("1.2"));
        assert!(!is_manifest_semver("1.2.x"));
        assert!(!is_manifest_semver("main"));
        assert!(!is_manifest_semver("1.0.0+build.5"));
        assert!(
            !is_manifest_semver("1.0.0-RC1"),
            "uppercase prerelease is rejected"
        );
        assert!(
            !is_manifest_semver("1.2.3.4"),
            "four-segment core is rejected"
        );
        assert!(is_manifest_semver("10.20.30"));
        assert!(is_manifest_semver("1.2.3"));
        assert!(is_manifest_semver("1.2.3-rc.1"));
    }

    #[test]
    fn coercion_output_always_satisfies_the_manifest_regex() {
        for raw in [
            "1.2.3",
            "0.0.0-dev",
            "deadbeefcafe",
            "1.0.0+build.5",
            "Feature/Branch-Name",
            "v1.2.3",
            "RELEASE",
            "!!!",
            "",
        ] {
            let coerced = coerce_manifest_version(raw);
            assert!(
                matches_manifest_semver_regex(&coerced),
                "coerce_manifest_version({raw:?}) -> {coerced:?} must satisfy the manifest SEMVER regex"
            );
        }
    }
}
