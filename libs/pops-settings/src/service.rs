//! The storage-agnostic RU+reset+seed service — the Rust mirror of TS
//! `service.ts`.
//!
//! The TS module is a set of pure functions over an injected drizzle handle;
//! the Rust mirror is the same logic over an injected [`SettingsStore`] trait,
//! so the crate binds to no specific database (the contacts pillar will supply
//! a sqlx-backed store). Every map output is a [`BTreeMap`] so the result is
//! deterministic and sorted.
//!
//! Protocol is READ + UPDATE + RESET only — there is no create verb and no
//! delete verb. The `ensure` write-once seed is internal-only.

use std::collections::BTreeMap;

use crate::manifest::KeyDefaults;
use crate::wire::Setting;

/// The per-pillar key/value persistence the service operates over. The mounting
/// pillar supplies the storage; the crate never opens a database itself. By
/// contract a store only ever holds that pillar's declared keys (there is no
/// owner/namespace column). Mirror of the injected drizzle `SettingsDb` handle.
pub trait SettingsStore {
    /// Read one stored override; `None` when the key has no row (the caller
    /// applies the manifest default). Does NOT resolve the default itself.
    fn get(&self, key: &str) -> Option<String>;

    /// Batch-read stored overrides by key. Missing keys are omitted. Duplicate
    /// input keys are de-duped by the [`BTreeMap`] result.
    fn get_bulk(&self, keys: &[String]) -> BTreeMap<String, String>;

    /// Upsert a single setting (UPDATE). The value is stored verbatim — writes
    /// are never redacted.
    fn set(&mut self, key: &str, value: &str);

    /// Transactional batch write (UPDATE) — every entry lands or none do.
    fn set_bulk(&mut self, entries: &[Setting]);

    /// Delete a stored override (idempotent — no-op when absent).
    fn delete(&mut self, key: &str);

    /// Write-once seed: insert only if absent, returning the value that is now
    /// stored (the existing one wins on a race). Mirror of TS
    /// `ON CONFLICT DO NOTHING` + re-read.
    fn ensure(&mut self, key: &str, value: &str) -> String;
}

/// Read one stored override as a [`Setting`]; `None` when unset. Mirror of TS
/// `getOrNull`.
pub fn get_or_null<S: SettingsStore>(store: &S, key: &str) -> Option<Setting> {
    store.get(key).map(|value| Setting::new(key, value))
}

/// Batch-read stored overrides by key (missing omitted). Mirror of TS
/// `getBulk`.
pub fn get_bulk<S: SettingsStore>(store: &S, keys: &[String]) -> BTreeMap<String, String> {
    if keys.is_empty() {
        return BTreeMap::new();
    }
    store.get_bulk(keys)
}

/// The effective value set: every declared key resolved to its stored override,
/// else its manifest default, else the empty string — in declared order. Mirror
/// of TS `listEffective`.
pub fn list_effective<S: SettingsStore>(store: &S, kd: &KeyDefaults) -> Vec<Setting> {
    let overrides = store.get_bulk(&kd.keys);
    kd.keys
        .iter()
        .map(|key| {
            let value = overrides
                .get(key)
                .cloned()
                .unwrap_or_else(|| kd.default_for(key));
            Setting::new(key.clone(), value)
        })
        .collect()
}

/// Upsert a single setting and return the persisted row. Mirror of TS
/// `setRaw`.
pub fn set_raw<S: SettingsStore>(store: &mut S, key: &str, value: &str) -> Setting {
    store.set(key, value);
    Setting::new(key, value)
}

/// Transactional batch write; returns a sorted mirror of the written entries.
/// Mirror of TS `setBulk`.
pub fn set_bulk<S: SettingsStore>(store: &mut S, entries: &[Setting]) -> BTreeMap<String, String> {
    if entries.is_empty() {
        return BTreeMap::new();
    }
    store.set_bulk(entries);
    entries
        .iter()
        .map(|entry| (entry.key.clone(), entry.value.clone()))
        .collect()
}

/// Write-once seed for values that must stay stable for the install's lifetime
/// (encryption seed, generated client id). INTERNAL-ONLY. Mirror of TS
/// `ensure`.
pub fn ensure<S: SettingsStore>(store: &mut S, key: &str, value: &str) -> Setting {
    let stored = store.ensure(key, value);
    Setting::new(key, stored)
}

/// RESET a single declared key to its manifest default by deleting any stored
/// override (idempotent — no error on miss). Returns the resolved default the
/// next read would observe. Mirror of TS `resetSetting`.
pub fn reset_setting<S: SettingsStore>(store: &mut S, key: &str, kd: &KeyDefaults) -> Setting {
    store.delete(key);
    Setting::new(key, kd.default_for(key))
}

/// The outcome of a batch reset: the keys reset and their resolved defaults.
/// Mirror of TS `ResetResult`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResetResult {
    /// Reset keys in declared/sorted order.
    pub reset: Vec<String>,
    /// Sorted key→default map for the reset keys.
    pub settings: BTreeMap<String, String>,
}

/// RESET declared keys to their manifest defaults. `keys` omitted (or empty)
/// resets ALL declared keys; otherwise only the supplied keys that are actually
/// declared (unknown keys are ignored, never written). Mirror of TS
/// `resetSettings`.
pub fn reset_settings<S: SettingsStore>(
    store: &mut S,
    keys: Option<&[String]>,
    kd: &KeyDefaults,
) -> ResetResult {
    let target: Vec<String> = match keys {
        Some(supplied) if !supplied.is_empty() => supplied
            .iter()
            .filter(|key| kd.is_declared(key))
            .cloned()
            .collect(),
        _ => kd.keys.clone(),
    };

    for key in &target {
        store.delete(key);
    }

    let settings = target
        .iter()
        .map(|key| (key.clone(), kd.default_for(key)))
        .collect();
    ResetResult {
        reset: target,
        settings,
    }
}

/// An in-memory [`SettingsStore`] — the test/non-DB binding, mirroring the role
/// of the TS in-memory better-sqlite3 test handle. Backed by a [`BTreeMap`] so
/// iteration is deterministic.
#[derive(Debug, Clone, Default)]
pub struct MemoryStore {
    rows: BTreeMap<String, String>,
}

impl MemoryStore {
    /// An empty store.
    pub fn new() -> Self {
        Self::default()
    }
}

impl SettingsStore for MemoryStore {
    fn get(&self, key: &str) -> Option<String> {
        self.rows.get(key).cloned()
    }

    fn get_bulk(&self, keys: &[String]) -> BTreeMap<String, String> {
        keys.iter()
            .filter_map(|key| self.rows.get(key).map(|value| (key.clone(), value.clone())))
            .collect()
    }

    fn set(&mut self, key: &str, value: &str) {
        self.rows.insert(key.to_string(), value.to_string());
    }

    fn set_bulk(&mut self, entries: &[Setting]) {
        for entry in entries {
            self.rows.insert(entry.key.clone(), entry.value.clone());
        }
    }

    fn delete(&mut self, key: &str) {
        self.rows.remove(key);
    }

    fn ensure(&mut self, key: &str, value: &str) -> String {
        self.rows
            .entry(key.to_string())
            .or_insert_with(|| value.to_string())
            .clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::{
        derive_key_set, DeclaredSettingsField, DeclaredSettingsGroup, DeclaredSettingsManifest,
    };

    fn kd_abc() -> KeyDefaults {
        derive_key_set(&[DeclaredSettingsManifest {
            groups: vec![DeclaredSettingsGroup {
                fields: vec![
                    DeclaredSettingsField::new("a").with_default("da"),
                    DeclaredSettingsField::new("b").with_default("db"),
                    DeclaredSettingsField::new("c"),
                ],
            }],
        }])
    }

    #[test]
    fn get_or_null_returns_none_when_unset() {
        let store = MemoryStore::new();
        assert_eq!(get_or_null(&store, "a"), None);
    }

    #[test]
    fn set_raw_then_get_returns_the_row() {
        let mut store = MemoryStore::new();
        assert_eq!(set_raw(&mut store, "a", "v"), Setting::new("a", "v"));
        assert_eq!(get_or_null(&store, "a"), Some(Setting::new("a", "v")));
    }

    #[test]
    fn get_bulk_omits_missing_and_dedupes() {
        let mut store = MemoryStore::new();
        set_raw(&mut store, "a", "va");
        let keys = vec!["a".to_string(), "a".to_string(), "missing".to_string()];
        let out = get_bulk(&store, &keys);
        assert_eq!(out.len(), 1);
        assert_eq!(out["a"], "va");
    }

    #[test]
    fn list_effective_resolves_override_then_default_then_empty() {
        let mut store = MemoryStore::new();
        set_raw(&mut store, "a", "override");
        let out = list_effective(&store, &kd_abc());
        assert_eq!(
            out,
            vec![
                Setting::new("a", "override"),
                Setting::new("b", "db"),
                Setting::new("c", ""),
            ]
        );
    }

    #[test]
    fn set_bulk_is_all_or_nothing_mirror() {
        let mut store = MemoryStore::new();
        let entries = vec![Setting::new("a", "1"), Setting::new("b", "2")];
        let mirror = set_bulk(&mut store, &entries);
        assert_eq!(mirror["a"], "1");
        assert_eq!(mirror["b"], "2");
        assert_eq!(store.get("a").as_deref(), Some("1"));
    }

    #[test]
    fn ensure_is_write_once() {
        let mut store = MemoryStore::new();
        assert_eq!(ensure(&mut store, "seed", "first").value, "first");
        assert_eq!(
            ensure(&mut store, "seed", "second").value,
            "first",
            "the first write wins; ensure never overwrites"
        );
    }

    #[test]
    fn reset_setting_deletes_override_and_returns_default() {
        let mut store = MemoryStore::new();
        set_raw(&mut store, "a", "override");
        assert_eq!(
            reset_setting(&mut store, "a", &kd_abc()),
            Setting::new("a", "da")
        );
        assert_eq!(get_or_null(&store, "a"), None);
    }

    #[test]
    fn reset_setting_is_idempotent_and_empty_default_when_undeclared_default() {
        let mut store = MemoryStore::new();
        let kd = kd_abc();
        assert_eq!(reset_setting(&mut store, "a", &kd), Setting::new("a", "da"));
        set_raw(&mut store, "c", "x");
        assert_eq!(reset_setting(&mut store, "c", &kd), Setting::new("c", ""));
    }

    #[test]
    fn reset_settings_resets_only_supplied_declared_keys() {
        let mut store = MemoryStore::new();
        set_raw(&mut store, "a", "oa");
        set_raw(&mut store, "b", "ob");
        let result = reset_settings(&mut store, Some(&["a".to_string()]), &kd_abc());
        assert_eq!(result.reset, ["a"]);
        assert_eq!(result.settings["a"], "da");
        assert_eq!(get_or_null(&store, "a"), None);
        assert_eq!(store.get("b").as_deref(), Some("ob"));
    }

    #[test]
    fn reset_settings_resets_all_when_keys_omitted_or_empty() {
        let kd = kd_abc();
        for keys in [None, Some(Vec::new())] {
            let mut store = MemoryStore::new();
            set_raw(&mut store, "a", "oa");
            let result = reset_settings(&mut store, keys.as_deref(), &kd);
            assert_eq!(result.reset, ["a", "b", "c"]);
            assert_eq!(result.settings["a"], "da");
            assert_eq!(result.settings["b"], "db");
            assert_eq!(result.settings["c"], "");
        }
    }

    #[test]
    fn reset_settings_ignores_unknown_keys() {
        let mut store = MemoryStore::new();
        set_raw(&mut store, "a", "oa");
        let result = reset_settings(
            &mut store,
            Some(&["a".to_string(), "not-declared".to_string()]),
            &kd_abc(),
        );
        assert_eq!(result.reset, ["a"]);
        assert!(!result.settings.contains_key("not-declared"));
    }
}
