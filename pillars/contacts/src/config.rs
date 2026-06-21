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

/// Resolved configuration for one process lifetime.
#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub sqlite_path: String,
    pub version: String,
}

impl Config {
    /// Resolve configuration from the process environment, falling back to
    /// the module defaults for any unset or unparseable value.
    pub fn from_env() -> Self {
        Self {
            port: resolve_port(),
            sqlite_path: env::var("CONTACTS_SQLITE_PATH")
                .unwrap_or_else(|_| DEFAULT_SQLITE_PATH.to_string()),
            version: env::var("BUILD_VERSION").unwrap_or_else(|_| DEFAULT_VERSION.to_string()),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn database_url_targets_the_resolved_path_in_rwc_mode() {
        let config = Config {
            port: DEFAULT_PORT,
            sqlite_path: "/tmp/contacts.db".to_string(),
            version: DEFAULT_VERSION.to_string(),
        };
        assert_eq!(config.database_url(), "sqlite:///tmp/contacts.db?mode=rwc");
    }

    #[test]
    fn default_port_avoids_the_ai_and_orchestrator_slots() {
        assert_ne!(DEFAULT_PORT, 3008, "3008 is the ai pillar");
        assert_ne!(DEFAULT_PORT, 3009, "3009 is the orchestrator");
        assert_eq!(DEFAULT_PORT, 3010);
    }
}
