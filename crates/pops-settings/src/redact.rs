//! Read-side sensitive-value redaction — the Rust mirror of TS `redact.ts`.
//!
//! Sensitive keys read back as a fixed [`REDACTED`] sentinel; writes are never
//! passed through here, so the stored value stays intact and only outbound
//! reads are masked. This matches OD-8 in `docs/plans/02-settings-federation.md`:
//! the shell renders a field holding the sentinel as an empty password input
//! and only sends edited fields, so a no-op save never persists the sentinel
//! over the real secret.

use std::collections::{BTreeMap, BTreeSet};

use crate::wire::Setting;

/// Fixed sentinel a sensitive value reads back as. Byte-identical to the TS
/// `REDACTED` constant.
pub const REDACTED: &str = "__redacted__";

/// Masks sensitive values for READ paths only. Returns a new vec; rows whose
/// key is in `sensitive` have their value replaced by [`REDACTED`]. Writes are
/// never passed through this.
pub fn redact_sensitive(rows: &[Setting], sensitive: &BTreeSet<String>) -> Vec<Setting> {
    rows.iter()
        .map(|row| {
            if sensitive.contains(&row.key) {
                Setting::new(row.key.clone(), REDACTED)
            } else {
                row.clone()
            }
        })
        .collect()
}

/// Redacts the values of a key→value map for READ paths. Returns a new sorted
/// map; keys in `sensitive` map to [`REDACTED`].
pub fn redact_sensitive_map(
    settings: &BTreeMap<String, String>,
    sensitive: &BTreeSet<String>,
) -> BTreeMap<String, String> {
    settings
        .iter()
        .map(|(key, value)| {
            if sensitive.contains(key) {
                (key.clone(), REDACTED.to_string())
            } else {
                (key.clone(), value.clone())
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sensitive_set(keys: &[&str]) -> BTreeSet<String> {
        keys.iter().map(|k| (*k).to_string()).collect()
    }

    #[test]
    fn masks_sensitive_rows_and_leaves_others_intact() {
        let sensitive = sensitive_set(&["plex_token", "finance.apiToken"]);
        let rows = vec![
            Setting::new("plex_url", "http://plex.local"),
            Setting::new("plex_token", "super-secret-ciphertext"),
            Setting::new("finance.apiToken", "tok_live_123"),
        ];
        let out = redact_sensitive(&rows, &sensitive);
        assert_eq!(out[0], Setting::new("plex_url", "http://plex.local"));
        assert_eq!(out[1], Setting::new("plex_token", REDACTED));
        assert_eq!(out[2], Setting::new("finance.apiToken", REDACTED));
    }

    #[test]
    fn does_not_mutate_input_rows() {
        let sensitive = sensitive_set(&["plex_token"]);
        let rows = vec![Setting::new("plex_token", "secret")];
        let _ = redact_sensitive(&rows, &sensitive);
        assert_eq!(rows[0].value, "secret");
    }

    #[test]
    fn empty_rows_round_trip_unchanged() {
        let sensitive = sensitive_set(&["plex_token"]);
        assert!(redact_sensitive(&[], &sensitive).is_empty());
    }

    #[test]
    fn masks_sensitive_entries_in_a_map() {
        let sensitive = sensitive_set(&["secret"]);
        let mut input = BTreeMap::new();
        input.insert("public".to_string(), "v".to_string());
        input.insert("secret".to_string(), "hidden".to_string());
        let out = redact_sensitive_map(&input, &sensitive);
        assert_eq!(out["public"], "v");
        assert_eq!(out["secret"], REDACTED);
        assert_eq!(input["secret"], "hidden", "input map is not mutated");
    }
}
