//! Environment-resolved runtime configuration for the contacts pillar.
//!
//! Every knob has a deterministic default so the binary boots with zero env
//! in local/dev and CI. Production overrides arrive via the docker-compose
//! service definition (a later node wires that).

use std::env;

/// Default listen port for the contacts API.
///
/// `3008` is the `ai` pillar and `3009` is the orchestrator, so contacts
/// takes the next free slot. Kept in lock-step with `PILLAR_UPSTREAMS`
/// (`apps/pops-shell/scripts/generate-nginx-conf.ts`).
pub const DEFAULT_PORT: u16 = 3010;

/// Default on-disk SQLite location. Overridden in-cluster by
/// `CONTACTS_SQLITE_PATH=/data/sqlite/contacts.db`.
pub const DEFAULT_SQLITE_PATH: &str = "contacts.db";

/// Build version surfaced on `/health` and in the OpenAPI document. A real
/// release overrides `BUILD_VERSION` with a semver or git SHA.
pub const DEFAULT_VERSION: &str = "0.0.0-dev";

/// Registry base URL used when neither `POPS_REGISTRY_URL` nor `CORE_URL` is
/// set. Matches the TS SDK fallback (`bootstrap/bootstrap.ts`) and the
/// `core-api` compose service name.
pub const DEFAULT_REGISTRY_URL: &str = "http://core-api:3001";

/// Resolved configuration for one process lifetime.
#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub sqlite_path: String,
    pub version: String,
    /// Whether to attempt registry self-registration on boot. Mirrors the TS
    /// pillars' opt-in `POPS_REGISTRY_ENABLED=true` gate — off by default so
    /// local/test runs never reach out to a registry.
    pub registry_enabled: bool,
    /// Registry base origin contacts registers/heartbeats/deregisters against
    /// (`POPS_REGISTRY_URL`, then `CORE_URL`, then [`DEFAULT_REGISTRY_URL`]).
    pub registry_url: String,
    /// The base URL the registry records for this pillar — the origin other
    /// services dial to reach `/health`, `/uri/resolve`, etc. Persisted as the
    /// `PillarRegistryEntry.baseUrl`.
    pub self_base_url: String,
}

impl Config {
    /// Resolve configuration from the process environment, falling back to
    /// the module defaults for any unset or unparseable value.
    pub fn from_env() -> Self {
        let port = resolve_port();
        Self {
            port,
            sqlite_path: env::var("CONTACTS_SQLITE_PATH")
                .unwrap_or_else(|_| DEFAULT_SQLITE_PATH.to_string()),
            version: env::var("BUILD_VERSION").unwrap_or_else(|_| DEFAULT_VERSION.to_string()),
            registry_enabled: env::var("POPS_REGISTRY_ENABLED")
                .map(|raw| raw.trim() == "true")
                .unwrap_or(false),
            registry_url: resolve_registry_url(),
            self_base_url: resolve_self_base_url(port),
        }
    }

    /// The sqlx connect string for the resolved SQLite path. `?mode=rwc`
    /// creates the file if it does not yet exist so first boot succeeds.
    pub fn database_url(&self) -> String {
        format!("sqlite://{}?mode=rwc", self.sqlite_path)
    }
}

fn resolve_port() -> u16 {
    match env::var("CONTACTS_PORT").or_else(|_| env::var("PORT")) {
        Ok(raw) => raw.trim().parse().unwrap_or(DEFAULT_PORT),
        Err(_) => DEFAULT_PORT,
    }
}

/// `POPS_REGISTRY_URL` → `CORE_URL` → [`DEFAULT_REGISTRY_URL`], trailing
/// slashes stripped so path concatenation in the transport is clean.
fn resolve_registry_url() -> String {
    let raw = first_non_empty_env(&["POPS_REGISTRY_URL", "CORE_URL"])
        .unwrap_or_else(|| DEFAULT_REGISTRY_URL.to_string());
    strip_trailing_slashes(&raw)
}

/// `CONTACTS_SELF_BASE_URL` → `http://localhost:<port>` fallback, trailing
/// slashes stripped.
fn resolve_self_base_url(port: u16) -> String {
    let raw = first_non_empty_env(&["CONTACTS_SELF_BASE_URL"])
        .unwrap_or_else(|| format!("http://localhost:{port}"));
    strip_trailing_slashes(&raw)
}

/// First env var in `names` set to a non-blank value, trimmed.
fn first_non_empty_env(names: &[&str]) -> Option<String> {
    names.iter().find_map(|name| {
        env::var(name)
            .ok()
            .map(|raw| raw.trim().to_string())
            .filter(|raw| !raw.is_empty())
    })
}

fn strip_trailing_slashes(value: &str) -> String {
    value.trim_end_matches('/').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_config() -> Config {
        Config {
            port: DEFAULT_PORT,
            sqlite_path: "/tmp/contacts.db".to_string(),
            version: DEFAULT_VERSION.to_string(),
            registry_enabled: false,
            registry_url: DEFAULT_REGISTRY_URL.to_string(),
            self_base_url: "http://localhost:3010".to_string(),
        }
    }

    #[test]
    fn database_url_targets_the_resolved_path_in_rwc_mode() {
        let config = sample_config();
        assert_eq!(config.database_url(), "sqlite:///tmp/contacts.db?mode=rwc");
    }

    #[test]
    fn default_port_avoids_the_ai_and_orchestrator_slots() {
        assert_ne!(DEFAULT_PORT, 3008, "3008 is the ai pillar");
        assert_ne!(DEFAULT_PORT, 3009, "3009 is the orchestrator");
        assert_eq!(DEFAULT_PORT, 3010);
    }

    #[test]
    fn strip_trailing_slashes_normalises_origins() {
        assert_eq!(
            strip_trailing_slashes("http://core-api:3001/"),
            "http://core-api:3001"
        );
        assert_eq!(
            strip_trailing_slashes("http://core-api:3001///"),
            "http://core-api:3001"
        );
        assert_eq!(
            strip_trailing_slashes("http://core-api:3001"),
            "http://core-api:3001"
        );
    }
}
