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
    HttpRegistryTransport, RegistryError, RegistryTransport, RESOLVER_LEGACY_PATHS,
    RESOLVER_PRIMARY_PATHS,
};

/// Matches a valid semver (with optional prerelease/build metadata). Mirrors
/// the SDK's `SEMVER_RE` so the two ecosystems coerce identically.
fn is_semver(version: &str) -> bool {
    let mut parts = version.splitn(3, '.');
    let (Some(major), Some(minor), Some(rest)) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    if !is_all_digits(major) || !is_all_digits(minor) {
        return false;
    }
    // `rest` is the patch plus any `-prerelease` / `+build` suffix. The patch
    // run must be all digits; anything after the first `-` or `+` is free-form.
    let patch_end = rest.find(['-', '+']).unwrap_or(rest.len());
    let patch = &rest[..patch_end];
    is_all_digits(patch)
}

fn is_all_digits(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|b| b.is_ascii_digit())
}

/// Coerce a raw `BUILD_VERSION` into a manifest-valid semver.
///
/// Watchtower-driven deploys inject the git SHA as `BUILD_VERSION`, but the
/// manifest schema requires semver. Rather than fail register, a non-semver
/// value becomes `0.0.0-sha.<first7>` (a valid prerelease). Already-semver
/// values pass through unchanged. Byte-for-byte the SDK's `coerceManifestVersion`
/// rule.
pub fn coerce_manifest_version(raw: &str) -> String {
    if is_semver(raw) {
        return raw.to_string();
    }
    let short: String = raw.chars().take(7).collect();
    format!("0.0.0-sha.{short}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semver_values_pass_through_unchanged() {
        assert_eq!(coerce_manifest_version("1.2.3"), "1.2.3");
        assert_eq!(
            coerce_manifest_version("0.0.0-sha.abcdef0"),
            "0.0.0-sha.abcdef0"
        );
        assert_eq!(coerce_manifest_version("2.0.0-rc.1"), "2.0.0-rc.1");
    }

    #[test]
    fn a_git_sha_is_coerced_to_a_semver_prerelease() {
        assert_eq!(coerce_manifest_version("deadbeefcafe"), "0.0.0-sha.deadbee");
        // Short SHA shorter than 7 chars keeps its full length.
        assert_eq!(coerce_manifest_version("abc"), "0.0.0-sha.abc");
    }

    #[test]
    fn the_dev_default_is_not_semver_and_is_coerced() {
        // `0.0.0-dev` IS valid semver (prerelease `dev`), so it passes through.
        assert_eq!(coerce_manifest_version("0.0.0-dev"), "0.0.0-dev");
        // A bare `dev` is not semver.
        assert_eq!(coerce_manifest_version("dev"), "0.0.0-sha.dev");
    }

    #[test]
    fn is_semver_rejects_non_numeric_cores() {
        assert!(!is_semver("v1.2.3"));
        assert!(!is_semver("1.2"));
        assert!(!is_semver("1.2.x"));
        assert!(!is_semver("main"));
        assert!(is_semver("10.20.30"));
        assert!(is_semver("1.0.0+build.5"));
    }
}
