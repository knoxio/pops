//! Manifest → key authority derivation — the Rust mirror of TS
//! `manifest-keys.ts`.
//!
//! A pillar's settings manifest is the single authority for its declared keys
//! (no central enum). [`derive_key_set`] flattens the manifest descriptors into
//! the [`KeyDefaults`] the service and handlers gate on: the ordered declared
//! keys, the key→default map (only keys with an explicit default), and the
//! sensitive-key set (redacted on read).

use std::collections::{BTreeMap, BTreeSet};

/// A single declared settings field — the structural subset read here. Mirror
/// of TS `DeclaredSettingsField`.
#[derive(Debug, Clone)]
pub struct DeclaredSettingsField {
    pub key: String,
    pub default: Option<String>,
    pub sensitive: bool,
}

impl DeclaredSettingsField {
    /// A plain field with no default and not sensitive.
    pub fn new(key: impl Into<String>) -> Self {
        Self {
            key: key.into(),
            default: None,
            sensitive: false,
        }
    }

    /// Sets the manifest default for this field.
    pub fn with_default(mut self, default: impl Into<String>) -> Self {
        self.default = Some(default.into());
        self
    }

    /// Marks this field sensitive (redacted on read).
    pub fn sensitive(mut self) -> Self {
        self.sensitive = true;
        self
    }
}

/// A group of declared fields within a manifest descriptor. Mirror of TS
/// `DeclaredSettingsGroup`.
#[derive(Debug, Clone, Default)]
pub struct DeclaredSettingsGroup {
    pub fields: Vec<DeclaredSettingsField>,
}

/// The structural subset of a settings manifest descriptor read here. Mirror of
/// TS `DeclaredSettingsManifest`.
#[derive(Debug, Clone, Default)]
pub struct DeclaredSettingsManifest {
    pub groups: Vec<DeclaredSettingsGroup>,
}

/// The resolved key authority for one pillar: the ordered declared keys, the
/// key→default map (only keys with an explicit manifest default), and the
/// sensitive-key set (redacted on read). Mirror of TS `KeyDefaults`.
#[derive(Debug, Clone, Default)]
pub struct KeyDefaults {
    /// Declared keys in manifest declaration order. Order is load-bearing for
    /// `list`/`reset` outputs.
    pub keys: Vec<String>,
    /// Sorted key→default map; only keys with an explicit manifest default.
    pub defaults: BTreeMap<String, String>,
    /// Sorted set of sensitive keys (redacted on read).
    pub sensitive: BTreeSet<String>,
}

impl KeyDefaults {
    /// Whether `key` is one of this pillar's declared keys.
    pub fn is_declared(&self, key: &str) -> bool {
        self.keys.iter().any(|k| k == key)
    }

    /// The resolved default for `key` (manifest default, else the empty
    /// string), matching TS `kd.defaults[key] ?? ''`.
    pub fn default_for(&self, key: &str) -> String {
        self.defaults.get(key).cloned().unwrap_or_default()
    }
}

/// Flattens a pillar's manifest descriptors into its [`KeyDefaults`]. Iterates
/// every group's fields in declaration order, collecting keys, explicit
/// defaults, and sensitive flags. Mirror of TS `deriveKeySet`.
pub fn derive_key_set(manifests: &[DeclaredSettingsManifest]) -> KeyDefaults {
    let mut kd = KeyDefaults::default();
    for manifest in manifests {
        for group in &manifest.groups {
            for field in &group.fields {
                kd.keys.push(field.key.clone());
                if let Some(default) = &field.default {
                    kd.defaults.insert(field.key.clone(), default.clone());
                }
                if field.sensitive {
                    kd.sensitive.insert(field.key.clone());
                }
            }
        }
    }
    kd
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest(fields: Vec<DeclaredSettingsField>) -> DeclaredSettingsManifest {
        DeclaredSettingsManifest {
            groups: vec![DeclaredSettingsGroup { fields }],
        }
    }

    #[test]
    fn collects_keys_in_declaration_order() {
        let kd = derive_key_set(&[manifest(vec![
            DeclaredSettingsField::new("b"),
            DeclaredSettingsField::new("a"),
            DeclaredSettingsField::new("c"),
        ])]);
        assert_eq!(kd.keys, ["b", "a", "c"]);
    }

    #[test]
    fn collects_only_explicit_defaults() {
        let kd = derive_key_set(&[manifest(vec![
            DeclaredSettingsField::new("a").with_default("da"),
            DeclaredSettingsField::new("b"),
        ])]);
        assert_eq!(kd.defaults.get("a").map(String::as_str), Some("da"));
        assert!(!kd.defaults.contains_key("b"));
        assert_eq!(kd.default_for("b"), "");
    }

    #[test]
    fn collects_sensitive_flags() {
        let kd = derive_key_set(&[manifest(vec![
            DeclaredSettingsField::new("token").sensitive(),
            DeclaredSettingsField::new("url"),
        ])]);
        assert!(kd.sensitive.contains("token"));
        assert!(!kd.sensitive.contains("url"));
    }

    #[test]
    fn flattens_multiple_manifests_and_groups() {
        let kd = derive_key_set(&[
            DeclaredSettingsManifest {
                groups: vec![
                    DeclaredSettingsGroup {
                        fields: vec![DeclaredSettingsField::new("a")],
                    },
                    DeclaredSettingsGroup {
                        fields: vec![DeclaredSettingsField::new("b")],
                    },
                ],
            },
            manifest(vec![DeclaredSettingsField::new("c")]),
        ]);
        assert_eq!(kd.keys, ["a", "b", "c"]);
    }
}
