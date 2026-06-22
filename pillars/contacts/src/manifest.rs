//! The contacts pillar's registry manifest — the static capability document
//! pushed to core in the register envelope and re-served in the discovery
//! snapshot.
//!
//! It is byte-shape-compatible with the TS `ManifestPayloadSchema`
//! (`packages/pillar-sdk/src/manifest-schema/schema.ts`), which core runs
//! `validateManifestPayload` against on register — a rejected manifest fails
//! boot loudly (the register call returns a non-retriable 400). Two grammars
//! are deliberately distinct and must not be conflated:
//!
//!   - manifest `routes[*]` / `search.adapters[*].procedurePath` use the
//!     THREE-segment `<pillar>.<router>.<procedure>` form
//!     (`contacts.entities.list`, `contacts.search.search`);
//!   - the OpenAPI `operation_id` uses the TWO-segment `<router>.<procedure>`
//!     form (`entities.list`, `search.search`) — emitted by the entities/search
//!     route handlers, not here.
//!
//! Settings declare an empty manifest set until the shared `pops-settings`
//! crate lands (a later node); contacts is a first-class registry member
//! without a settings panel.

use serde_json::{json, Value};

/// Build the contacts manifest as a `serde_json::Value` matching
/// `ManifestPayloadSchema`. `version` is the already-coerced semver
/// (see [`crate::registry::coerce_manifest_version`]); the contract block
/// derives its `version`/`tag` from the same value.
pub fn build_contacts_manifest(version: &str) -> Value {
    json!({
        "pillar": "contacts",
        "version": version,
        "contract": {
            "package": "@pops/contacts",
            "version": version,
            "tag": format!("contract-contacts@v{version}"),
        },
        "routes": {
            "queries": [
                "contacts.entities.list",
                "contacts.entities.get",
                "contacts.search.search",
            ],
            "mutations": [
                "contacts.entities.create",
                "contacts.entities.update",
                "contacts.entities.delete",
            ],
            "subscriptions": [],
        },
        "search": {
            "adapters": [
                {
                    "name": "contacts",
                    "entityType": "contact",
                    "queryShape": {
                        "supportsText": true,
                        "supportsTags": false,
                        "supportsDateRange": false,
                        "supportsScope": [],
                    },
                    "procedurePath": "contacts.search.search",
                    "rankFieldName": "score",
                }
            ],
        },
        "ai": { "tools": [] },
        "uri": { "types": ["contacts/contact"] },
        "consumedSettings": { "keys": [] },
        "settings": { "manifests": [] },
        "pages": [
            { "path": "", "index": true, "bundleSlot": "contacts-list" }
        ],
        "healthcheck": { "path": "/health" },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_pillar_and_version_match_the_argument() {
        let manifest = build_contacts_manifest("1.2.3");
        assert_eq!(manifest["pillar"], json!("contacts"));
        assert_eq!(manifest["version"], json!("1.2.3"));
        assert_eq!(manifest["contract"]["version"], json!("1.2.3"));
        assert_eq!(
            manifest["contract"]["tag"],
            json!("contract-contacts@v1.2.3")
        );
        assert_eq!(manifest["contract"]["package"], json!("@pops/contacts"));
    }

    #[test]
    fn routes_use_the_three_segment_procedure_path_grammar() {
        let manifest = build_contacts_manifest("0.0.0-dev");
        let queries = manifest["routes"]["queries"].as_array().unwrap();
        assert!(queries.contains(&json!("contacts.entities.list")));
        assert!(queries.contains(&json!("contacts.search.search")));
        let mutations = manifest["routes"]["mutations"].as_array().unwrap();
        assert!(mutations.contains(&json!("contacts.entities.create")));
        // Every declared procedure path is the dotted three-segment form.
        for path in queries.iter().chain(mutations.iter()) {
            let segments: Vec<&str> = path.as_str().unwrap().split('.').collect();
            assert_eq!(
                segments.len(),
                3,
                "procedure path must be <pillar>.<router>.<procedure>: {path}"
            );
            assert_eq!(segments[0], "contacts");
        }
    }

    #[test]
    fn search_adapter_declares_a_text_query_shape_so_the_orchestrator_federates() {
        let manifest = build_contacts_manifest("0.0.0-dev");
        let adapters = manifest["search"]["adapters"].as_array().unwrap();
        assert_eq!(
            adapters.len(),
            1,
            "a single contacts adapter drives federation"
        );
        let adapter = &adapters[0];
        assert_eq!(adapter["name"], json!("contacts"));
        assert_eq!(adapter["entityType"], json!("contact"));
        assert_eq!(adapter["procedurePath"], json!("contacts.search.search"));
        assert_eq!(adapter["rankFieldName"], json!("score"));
        assert_eq!(adapter["queryShape"]["supportsText"], json!(true));
        assert_eq!(adapter["queryShape"]["supportsScope"], json!([]));
    }

    #[test]
    fn uri_type_is_the_two_segment_pillar_entity_form() {
        let manifest = build_contacts_manifest("0.0.0-dev");
        assert_eq!(manifest["uri"]["types"], json!(["contacts/contact"]));
    }

    #[test]
    fn settings_are_empty_until_the_shared_crate_lands() {
        let manifest = build_contacts_manifest("0.0.0-dev");
        assert_eq!(manifest["settings"]["manifests"], json!([]));
        assert_eq!(manifest["consumedSettings"]["keys"], json!([]));
        assert_eq!(manifest["ai"]["tools"], json!([]));
    }

    #[test]
    fn healthcheck_path_matches_the_served_route() {
        let manifest = build_contacts_manifest("0.0.0-dev");
        assert_eq!(manifest["healthcheck"]["path"], json!("/health"));
    }
}
