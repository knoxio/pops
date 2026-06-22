//! The pure RU+reset handler logic — the Rust mirror of TS `handlers.ts`.
//!
//! Each method gates the principal, runs the [`service`](crate::service), and
//! redacts sensitive values on READ paths only. The mounting pillar wraps these
//! in its axum adapter (principal extraction + error mapping). There is no
//! create or delete handler — only read, update, reset, and the internal-only
//! `ensure` seed. WRITE/RESET paths reject keys outside the declared set
//! ([`UnknownSettingKeyError`]) so a batch write can never become a backdoor
//! create; READ paths stay lenient (an undeclared key is simply absent).

use std::collections::BTreeMap;

use crate::error::UnknownSettingKeyError;
use crate::manifest::KeyDefaults;
use crate::redact::{redact_sensitive, redact_sensitive_map};
use crate::service::{
    ensure, get_bulk, get_or_null, list_effective, reset_setting, reset_settings, set_bulk,
    set_raw, ResetResult, SettingsStore,
};
use crate::wire::Setting;

/// The identity gate injected by the mounting pillar. Runs the same
/// authorization check the pillar's REST middleware uses and returns `Err` when
/// the principal lacks the scope. The principal and denial types are
/// associated (one gate authorizes one principal type) so [`SettingsHandlers`]
/// stays a two-parameter generic. Mirror of TS `SettingsGate<Principal>` (which
/// throws rather than returns).
pub trait SettingsGate {
    /// The principal type this gate authorizes (e.g. the pillar's session).
    type Principal;
    /// The error the pillar's middleware raises on denial (e.g. its
    /// `UnauthorizedError`). Surfaced verbatim to the caller.
    type Denied;

    /// Authorize `principal` for `scope` (e.g. `"finance.settings.get"`).
    fn check(&self, principal: &Self::Principal, scope: &str) -> Result<(), Self::Denied>;
}

/// A handler failure: either the injected gate denied the principal, or a
/// write/reset addressed an undeclared key.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HandlerError<Denied> {
    /// The gate rejected the principal; carries the pillar's own denial value.
    Denied(Denied),
    /// A write/reset addressed keys outside the declared set.
    UnknownKey(UnknownSettingKeyError),
}

impl<Denied> From<UnknownSettingKeyError> for HandlerError<Denied> {
    fn from(err: UnknownSettingKeyError) -> Self {
        HandlerError::UnknownKey(err)
    }
}

/// The injected, pillar-agnostic RU+reset handlers bound to one store, key
/// authority, scope prefix, and identity gate. READ paths
/// (`list`/`get`/`get_many`) redact sensitive keys to the `__redacted__`
/// sentinel; UPDATE/RESET paths persist and return real values. Mirror of TS
/// `makeSettingsHandlers`.
pub struct SettingsHandlers<S, G> {
    store: S,
    key_defaults: KeyDefaults,
    scope_prefix: String,
    gate: G,
}

impl<S, G> SettingsHandlers<S, G>
where
    S: SettingsStore,
    G: SettingsGate,
{
    /// Builds the handlers. `scope_prefix` is the gate prefix, e.g.
    /// `"finance.settings"`; each proc gates `"<prefix>.<proc>"`.
    pub fn new(
        store: S,
        key_defaults: KeyDefaults,
        scope_prefix: impl Into<String>,
        gate: G,
    ) -> Self {
        Self {
            store,
            key_defaults,
            scope_prefix: scope_prefix.into(),
            gate,
        }
    }

    fn scope(&self, proc: &str) -> String {
        format!("{}.{proc}", self.scope_prefix)
    }

    fn assert_declared(&self, keys: &[String]) -> Result<(), UnknownSettingKeyError> {
        let unknown: Vec<String> = keys
            .iter()
            .filter(|key| !self.key_defaults.is_declared(key))
            .cloned()
            .collect();
        if unknown.is_empty() {
            Ok(())
        } else {
            Err(UnknownSettingKeyError::new(unknown))
        }
    }

    fn gate(&self, principal: &G::Principal, proc: &str) -> Result<(), HandlerError<G::Denied>> {
        self.gate
            .check(principal, &self.scope(proc))
            .map_err(HandlerError::Denied)
    }

    /// `list` — every declared key's effective value (sensitive redacted).
    pub fn list(&self, principal: &G::Principal) -> Result<Vec<Setting>, HandlerError<G::Denied>> {
        self.gate(principal, "list")?;
        Ok(redact_sensitive(
            &list_effective(&self.store, &self.key_defaults),
            &self.key_defaults.sensitive,
        ))
    }

    /// `get` — a single setting, `None` on unset (sensitive redacted).
    pub fn get(
        &self,
        principal: &G::Principal,
        key: &str,
    ) -> Result<Option<Setting>, HandlerError<G::Denied>> {
        self.gate(principal, "get")?;
        let Some(row) = get_or_null(&self.store, key) else {
            return Ok(None);
        };
        Ok(redact_sensitive(&[row], &self.key_defaults.sensitive)
            .into_iter()
            .next())
    }

    /// `get_many` — batch-read (missing omitted, sensitive redacted).
    pub fn get_many(
        &self,
        principal: &G::Principal,
        keys: &[String],
    ) -> Result<BTreeMap<String, String>, HandlerError<G::Denied>> {
        self.gate(principal, "getMany")?;
        Ok(redact_sensitive_map(
            &get_bulk(&self.store, keys),
            &self.key_defaults.sensitive,
        ))
    }

    /// `set` — upsert a single declared setting (rejects undeclared keys).
    pub fn set(
        &mut self,
        principal: &G::Principal,
        key: &str,
        value: &str,
    ) -> Result<Setting, HandlerError<G::Denied>> {
        self.gate(principal, "set")?;
        self.assert_declared(&[key.to_string()])?;
        Ok(set_raw(&mut self.store, key, value))
    }

    /// `set_many` — transactional batch write (rejects any undeclared key).
    pub fn set_many(
        &mut self,
        principal: &G::Principal,
        entries: &[Setting],
    ) -> Result<BTreeMap<String, String>, HandlerError<G::Denied>> {
        self.gate(principal, "setMany")?;
        let keys: Vec<String> = entries.iter().map(|entry| entry.key.clone()).collect();
        self.assert_declared(&keys)?;
        Ok(set_bulk(&mut self.store, entries))
    }

    /// `reset_key` — reset one declared key to its default (rejects undeclared).
    pub fn reset_key(
        &mut self,
        principal: &G::Principal,
        key: &str,
    ) -> Result<Setting, HandlerError<G::Denied>> {
        self.gate(principal, "resetKey")?;
        self.assert_declared(&[key.to_string()])?;
        Ok(reset_setting(&mut self.store, key, &self.key_defaults))
    }

    /// `reset` — reset declared keys to defaults (omit ⇒ reset all).
    pub fn reset(
        &mut self,
        principal: &G::Principal,
        keys: Option<&[String]>,
    ) -> Result<ResetResult, HandlerError<G::Denied>> {
        self.gate(principal, "reset")?;
        Ok(reset_settings(&mut self.store, keys, &self.key_defaults))
    }

    /// `ensure` — internal-only write-once seed.
    pub fn ensure(
        &mut self,
        principal: &G::Principal,
        key: &str,
        value: &str,
    ) -> Result<Setting, HandlerError<G::Denied>> {
        self.gate(principal, "ensure")?;
        Ok(ensure(&mut self.store, key, value))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::{
        derive_key_set, DeclaredSettingsField, DeclaredSettingsGroup, DeclaredSettingsManifest,
    };
    use crate::redact::REDACTED;
    use crate::service::MemoryStore;

    /// A gate that allows everything — for the happy-path assertions.
    struct AllowAll;
    impl SettingsGate for AllowAll {
        type Principal = &'static str;
        type Denied = ();
        fn check(&self, _principal: &&'static str, _scope: &str) -> Result<(), ()> {
            Ok(())
        }
    }

    /// A gate that denies a single named scope, so the test can assert the
    /// dotted `<prefix>.<proc>` scope string.
    struct DenyScope {
        deny: &'static str,
    }
    impl SettingsGate for DenyScope {
        type Principal = &'static str;
        type Denied = String;
        fn check(&self, _principal: &&'static str, scope: &str) -> Result<(), String> {
            if scope == self.deny {
                Err(format!("denied: {scope}"))
            } else {
                Ok(())
            }
        }
    }

    fn kd() -> KeyDefaults {
        derive_key_set(&[DeclaredSettingsManifest {
            groups: vec![DeclaredSettingsGroup {
                fields: vec![
                    DeclaredSettingsField::new("theme").with_default("light"),
                    DeclaredSettingsField::new("token").sensitive(),
                ],
            }],
        }])
    }

    #[test]
    fn list_redacts_sensitive_values() {
        let mut store = MemoryStore::new();
        store.set("token", "super-secret");
        let handlers = SettingsHandlers::new(store, kd(), "finance.settings", AllowAll);
        let rows = handlers.list(&"admin").unwrap();
        let token = rows.iter().find(|s| s.key == "token").unwrap();
        assert_eq!(token.value, REDACTED);
        let theme = rows.iter().find(|s| s.key == "theme").unwrap();
        assert_eq!(theme.value, "light");
    }

    #[test]
    fn get_redacts_a_single_sensitive_value() {
        let mut store = MemoryStore::new();
        store.set("token", "secret");
        let handlers = SettingsHandlers::new(store, kd(), "finance.settings", AllowAll);
        let row = handlers.get(&"admin", "token").unwrap().unwrap();
        assert_eq!(row.value, REDACTED);
    }

    #[test]
    fn get_many_redacts_sensitive_values() {
        let mut store = MemoryStore::new();
        store.set("token", "secret");
        store.set("theme", "dark");
        let handlers = SettingsHandlers::new(store, kd(), "finance.settings", AllowAll);
        let out = handlers
            .get_many(&"admin", &["token".to_string(), "theme".to_string()])
            .unwrap();
        assert_eq!(out["token"], REDACTED);
        assert_eq!(out["theme"], "dark");
    }

    #[test]
    fn set_rejects_undeclared_key() {
        let mut handlers =
            SettingsHandlers::new(MemoryStore::new(), kd(), "finance.settings", AllowAll);
        let err = handlers.set(&"admin", "not-declared", "v").unwrap_err();
        assert_eq!(
            err,
            HandlerError::UnknownKey(UnknownSettingKeyError::new(
                vec!["not-declared".to_string()]
            ))
        );
    }

    #[test]
    fn set_persists_real_value_never_redacted() {
        let mut handlers =
            SettingsHandlers::new(MemoryStore::new(), kd(), "finance.settings", AllowAll);
        let written = handlers.set(&"admin", "token", "plaintext").unwrap();
        assert_eq!(written.value, "plaintext", "writes are never redacted");
    }

    #[test]
    fn gate_denial_gates_the_dotted_scope() {
        let gate = DenyScope {
            deny: "finance.settings.set",
        };
        let mut handlers =
            SettingsHandlers::new(MemoryStore::new(), kd(), "finance.settings", gate);
        assert!(handlers.list(&"admin").is_ok());
        let err = handlers.set(&"admin", "theme", "dark").unwrap_err();
        assert_eq!(
            err,
            HandlerError::Denied("denied: finance.settings.set".to_string())
        );
    }

    #[test]
    fn reset_does_not_reject_unknown_keys() {
        let mut handlers =
            SettingsHandlers::new(MemoryStore::new(), kd(), "finance.settings", AllowAll);
        let result = handlers
            .reset(
                &"admin",
                Some(&["theme".to_string(), "unknown".to_string()]),
            )
            .unwrap();
        assert_eq!(result.reset, ["theme"]);
    }
}
