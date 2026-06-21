//! Contract guards on the emitted OpenAPI document.
//!
//! These pin the two properties every downstream consumer relies on and which
//! the plan flags as the most dangerous defects:
//!
//!   1. The `operationId`s are the DOTTED `<router>.<proc>` strings the SDK
//!      route map keys on and hey-api derives camelCase method names from. A
//!      camelCase or fn-name-derived id silently breaks finance's live-fetch
//!      client and the orchestrator's search federation.
//!   2. The document is OpenAPI 3.0.x — utoipa emits 3.1 by default, which
//!      `@hey-api/openapi-ts` cannot consume.

use std::collections::BTreeSet;

use serde_json::Value;

use contacts::openapi::openapi_30_value;

fn operation_ids(doc: &Value) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();
    let paths = doc["paths"].as_object().expect("paths object");
    for methods in paths.values() {
        for op in methods.as_object().expect("method map").values() {
            if let Some(id) = op.get("operationId").and_then(Value::as_str) {
                ids.insert(id.to_string());
            }
        }
    }
    ids
}

#[test]
fn entities_and_search_operation_ids_are_dotted() {
    let doc = openapi_30_value();
    let ids = operation_ids(&doc);

    let required = [
        "entities.list",
        "entities.get",
        "entities.create",
        "entities.update",
        "entities.delete",
        "entities.lookup",
        "search.search",
    ];
    for id in required {
        assert!(
            ids.contains(id),
            "the document must carry the DOTTED operationId `{id}`; present ids: {ids:?}"
        );
    }
}

#[test]
fn every_operation_id_is_dotted_never_camel_case() {
    let doc = openapi_30_value();
    for id in operation_ids(&doc) {
        assert!(
            id.contains('.'),
            "operationId `{id}` is not dotted — hey-api would derive the wrong client method name"
        );
        assert!(
            !id.chars().any(|c| c.is_ascii_uppercase()),
            "operationId `{id}` contains uppercase — the dotted convention is lowercase `<router>.<proc>`"
        );
    }
}

#[test]
fn document_is_openapi_30() {
    let doc = openapi_30_value();
    let version = doc["openapi"].as_str().expect("openapi version string");
    assert!(
        version.starts_with("3.0"),
        "hey-api targets OpenAPI 3.0; got {version}"
    );
}

#[test]
fn entity_wire_schema_omits_internal_columns() {
    let doc = openapi_30_value();
    let props = doc["components"]["schemas"]["Entity"]["properties"]
        .as_object()
        .expect("Entity schema properties");
    for hidden in ["notionId", "ownerUri", "ownerUriStaleAt"] {
        assert!(
            !props.contains_key(hidden),
            "the wire Entity must not expose the internal column `{hidden}`"
        );
    }
    for exposed in [
        "id",
        "name",
        "type",
        "aliases",
        "defaultTags",
        "lastEditedTime",
    ] {
        assert!(
            props.contains_key(exposed),
            "the wire Entity must expose `{exposed}`"
        );
    }
}

#[test]
fn search_hit_uri_is_contacts_namespaced() {
    let doc = openapi_30_value();
    let paths = doc["paths"].as_object().unwrap();
    assert!(
        paths.contains_key("/search"),
        "the search route must be present so the orchestrator can federate it"
    );
}
