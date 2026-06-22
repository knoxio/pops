//! Cross-language golden-fixture parity tests for `pops-settings`.
//!
//! `tests/fixtures/settings.json` is the SHARED wire fixture: this test asserts
//! every Rust wire type round-trips its section, while the TS side
//! (`packages/pillar-settings/src/__tests__/contract-fixture.test.ts`) asserts
//! the SAME fixture is contract-schema-clean. Together they pin one federated
//! RU+reset wire across both languages.
//!
//! The fixture is authored in SORTED-key order. `serde_json::Map` is a
//! `BTreeMap` here (no `preserve_order` feature), so re-serializing a parsed
//! `Value` always emits sorted keys; the Rust wire structs declare their fields
//! in alphabetical order and use `BTreeMap` for every map output, so a typed
//! round-trip is byte-identical to the canonical sorted section. HTTP JSON
//! object key order is not semantically significant; sorted order is the
//! deterministic choice that lets the Rust and TS bytes be compared directly.

use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;

use pops_settings::{
    GetResponse, ListResponse, MutationResponse, ResetResponse, Setting, SettingsMapResponse,
    REDACTED,
};

const FIXTURE: &str = include_str!("fixtures/settings.json");

/// Parse the shared fixture into its section map.
fn sections() -> serde_json::Map<String, Value> {
    serde_json::from_str::<Value>(FIXTURE)
        .expect("fixture is valid JSON")
        .as_object()
        .expect("fixture is a JSON object of named sections")
        .clone()
}

/// The canonical (sorted-key, compact) serialization of one fixture section —
/// the bytes a byte-identical typed round-trip must reproduce.
fn canonical(section: &str) -> String {
    let value = sections()
        .get(section)
        .unwrap_or_else(|| panic!("fixture is missing section `{section}`"))
        .clone();
    serde_json::to_string(&value).expect("section re-serializes")
}

/// Deserialize a fixture section into `T`, re-serialize, and assert the bytes
/// equal the canonical sorted form. This is the per-type wire pin.
fn assert_round_trips<T: DeserializeOwned + Serialize>(section: &str) {
    let canonical = canonical(section);
    let typed: T = serde_json::from_str(&canonical)
        .unwrap_or_else(|e| panic!("section `{section}` deserializes into the wire type: {e}"));
    let reserialized = serde_json::to_string(&typed).expect("typed value re-serializes");
    assert_eq!(
        reserialized, canonical,
        "section `{section}` must round-trip byte-for-byte against the shared sorted fixture"
    );
}

#[test]
fn setting_round_trips_byte_for_byte() {
    assert_round_trips::<Setting>("setting");
}

#[test]
fn list_response_round_trips_byte_for_byte() {
    assert_round_trips::<ListResponse>("listResponse");
}

#[test]
fn get_response_round_trips_byte_for_byte() {
    assert_round_trips::<GetResponse>("getResponse");
}

#[test]
fn get_response_null_round_trips_byte_for_byte() {
    assert_round_trips::<GetResponse>("getResponseNull");
}

#[test]
fn settings_map_response_round_trips_byte_for_byte() {
    assert_round_trips::<SettingsMapResponse>("settingsMapResponse");
}

#[test]
fn reset_response_round_trips_byte_for_byte() {
    assert_round_trips::<ResetResponse>("resetResponse");
}

#[test]
fn mutation_response_round_trips_byte_for_byte() {
    assert_round_trips::<MutationResponse>("mutationResponse");
}

/// The unset single-read is the JSON `null`, NOT an omitted field or `{}` — the
/// TS contract types `data` as `SettingSchema | null`.
#[test]
fn unset_get_is_explicit_null() {
    let response: GetResponse = serde_json::from_str(&canonical("getResponseNull")).unwrap();
    assert!(response.data.is_none());
    assert_eq!(
        serde_json::to_string(&response).unwrap(),
        r#"{"data":null}"#
    );
}

/// Sensitive values read back as the fixed `__redacted__` sentinel, byte-equal
/// to the TS `REDACTED` constant — the read-side masking contract (OD-8).
#[test]
fn redaction_sentinel_is_byte_identical_to_ts() {
    assert_eq!(REDACTED, "__redacted__");
    let list: ListResponse = serde_json::from_str(&canonical("listResponse")).unwrap();
    let masked = list
        .data
        .iter()
        .find(|s| s.key == "finance.apiToken")
        .expect("the sensitive key is present in the list");
    assert_eq!(
        masked.value, REDACTED,
        "a sensitive value reads back as the shared sentinel"
    );
}

/// Maps serialize in sorted key order (BTreeMap), so the fixture's map sections
/// are already canonical — re-sorting them is a no-op.
#[test]
fn map_outputs_are_sorted() {
    let map: SettingsMapResponse = serde_json::from_str(&canonical("settingsMapResponse")).unwrap();
    let keys: Vec<&String> = map.settings.keys().collect();
    let mut sorted = keys.clone();
    sorted.sort();
    assert_eq!(keys, sorted, "BTreeMap output is sorted-key deterministic");
}

/// The emitted OpenAPI document pins the DOT-form `settings.*` operationIds the
/// TS ts-rest projection also emits, and carries NO create or delete verb.
#[test]
fn openapi_operation_ids_are_dot_form_and_complete() {
    let doc = pops_settings::openapi::openapi_30_value();
    let mut ids = std::collections::BTreeSet::new();
    for methods in doc["paths"].as_object().expect("paths object").values() {
        for op in methods.as_object().expect("method map").values() {
            if let Some(id) = op.get("operationId").and_then(Value::as_str) {
                ids.insert(id.to_string());
            }
        }
    }

    for required in [
        "settings.list",
        "settings.get",
        "settings.getMany",
        "settings.set",
        "settings.setMany",
        "settings.resetKey",
        "settings.reset",
    ] {
        assert!(
            ids.contains(required),
            "the document must carry the DOTTED operationId `{required}`; present: {ids:?}"
        );
    }

    for id in &ids {
        assert!(
            id.contains('.'),
            "operationId `{id}` is not dotted — hey-api would derive the wrong method name"
        );
        assert!(
            id.starts_with("settings."),
            "every settings operationId is namespaced `settings.<proc>`; got `{id}`"
        );
    }

    for forbidden in ["settings.create", "settings.delete"] {
        assert!(
            !ids.contains(forbidden),
            "the RU+reset surface has no `{forbidden}` verb"
        );
    }
}

/// The router wires the whole surface into a real axum `Router` once a store, a
/// gate, and a principal are supplied — proving the generic bounds of
/// `settings_router` / `SettingsState` line up end to end (not just that the
/// handlers compile in isolation).
#[test]
fn settings_router_binds_into_a_real_axum_app() {
    use std::sync::{Arc, Mutex};

    use pops_settings::{
        derive_key_set, settings_router, DeclaredSettingsField, DeclaredSettingsGroup,
        DeclaredSettingsManifest, MemoryStore, SettingsGate, SettingsHandlers, SettingsState,
    };

    struct AllowAll;
    impl SettingsGate for AllowAll {
        type Principal = String;
        type Denied = ();
        fn check(&self, _principal: &String, _scope: &str) -> Result<(), ()> {
            Ok(())
        }
    }

    let kd = derive_key_set(&[DeclaredSettingsManifest {
        groups: vec![DeclaredSettingsGroup {
            fields: vec![DeclaredSettingsField::new("theme").with_default("light")],
        }],
    }]);
    let handlers = SettingsHandlers::new(MemoryStore::new(), kd, "contacts.settings", AllowAll);
    let state = SettingsState {
        handlers: Arc::new(Mutex::new(handlers)),
        principal: "admin".to_string(),
    };

    let app: axum::Router = settings_router::<MemoryStore, AllowAll>().with_state(state);
    // Binding `with_state` to a unit router collapses the generic surface into a
    // concrete `Router<()>`; reaching this line means the full mount type-checks.
    let _ = app;
}
