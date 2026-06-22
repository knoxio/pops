//! OpenAPI document generation for the settings surface, pinned to **OpenAPI
//! 3.0.3**.
//!
//! Mirrors the contacts pillar's emission: utoipa 5 emits OpenAPI 3.1 by
//! default, but the repo's client generator (`@hey-api/openapi-ts`) targets
//! 3.0, so a deterministic post-process pass rewrites the serialized document
//! to a 3.0.3 shape (`type: [..,"null"]` → `nullable: true`; 3.1 `examples`
//! array → 3.0 singular `example`).
//!
//! The document documents the DOT-form `settings.*` operationIds — the polyglot
//! parity pin against the TS ts-rest projection.

use serde_json::{Map, Value};
use utoipa::OpenApi;

use crate::wire::{
    EnsureResponse, GetManyRequest, GetResponse, ListResponse, MutationResponse, ResetRequest,
    ResetResponse, SetManyRequest, Setting, SettingValueBody, SettingsMapResponse,
};

/// The settings OpenAPI surface. Documents the federated RU+reset routes with
/// DOTTED `settings.*` operationIds (`settings.list`, `settings.get`,
/// `settings.getMany`, `settings.set`, `settings.setMany`, `settings.resetKey`,
/// `settings.reset`, and the internal `settings.ensure`).
#[derive(OpenApi)]
#[openapi(
    info(
        title = "POPS Settings",
        description = "Federated RU+reset settings surface — Rust mirror of @pops/pillar-settings."
    ),
    paths(
        crate::routes::list,
        crate::routes::get_one,
        crate::routes::get_many,
        crate::routes::set,
        crate::routes::set_many,
        crate::routes::reset_key,
        crate::routes::reset,
        crate::routes::ensure,
    ),
    components(schemas(
        Setting,
        ListResponse,
        GetResponse,
        GetManyRequest,
        SettingsMapResponse,
        SettingValueBody,
        SetManyRequest,
        ResetRequest,
        ResetResponse,
        MutationResponse,
        EnsureResponse,
    ))
)]
pub struct ApiDoc;

/// The OpenAPI version string every emitted/served document is pinned to.
pub const OPENAPI_VERSION: &str = "3.0.3";

/// Render the OpenAPI document as a 3.0.3 `serde_json::Value`.
pub fn openapi_30_value() -> Value {
    let mut doc =
        serde_json::to_value(ApiDoc::openapi()).expect("utoipa OpenApi serializes to a JSON value");
    downgrade_to_30(&mut doc);
    doc
}

/// Render the 3.0.3 document as deterministic pretty JSON with a trailing
/// newline (so a committed copy would be diff-stable across regenerations).
pub fn openapi_30_json() -> String {
    let value = openapi_30_value();
    let mut json =
        serde_json::to_string_pretty(&value).expect("3.0 OpenAPI value serializes to pretty JSON");
    json.push('\n');
    json
}

/// Force the top-level `openapi` field to 3.0.3 and recursively rewrite the
/// schema tree to the 3.0 dialect.
fn downgrade_to_30(doc: &mut Value) {
    if let Value::Object(map) = doc {
        map.insert(
            "openapi".to_string(),
            Value::String(OPENAPI_VERSION.to_string()),
        );
    }
    rewrite_schema_node(doc);
}

/// Recursively convert 3.1-only schema constructs to their 3.0 equivalents.
fn rewrite_schema_node(node: &mut Value) {
    match node {
        Value::Object(map) => {
            rewrite_nullable_type_union(map);
            rewrite_nullable_composition(map);
            rewrite_examples_to_example(map);
            for value in map.values_mut() {
                rewrite_schema_node(value);
            }
        }
        Value::Array(items) => {
            for item in items.iter_mut() {
                rewrite_schema_node(item);
            }
        }
        _ => {}
    }
}

/// `type: ["string", "null"]` → `type: "string"` + `nullable: true`.
fn rewrite_nullable_type_union(map: &mut Map<String, Value>) {
    let Some(Value::Array(variants)) = map.get("type") else {
        return;
    };
    let has_null = variants
        .iter()
        .any(|v| v == &Value::String("null".to_string()));
    if !has_null {
        return;
    }
    let concrete: Vec<Value> = variants
        .iter()
        .filter(|v| *v != &Value::String("null".to_string()))
        .cloned()
        .collect();
    if let [single] = concrete.as_slice() {
        map.insert("type".to_string(), single.clone());
        map.insert("nullable".to_string(), Value::Bool(true));
    }
}

/// 3.1 `Option<Object>` emits as `oneOf: [{type:"null"}, {$ref}]` (or
/// `anyOf`). 3.0 has no `null` type, so drop the null member and set
/// `nullable: true`. When exactly one member remains, inline it: a `$ref`
/// cannot carry a sibling `nullable` in 3.0, so wrap it as `allOf: [{$ref}]`;
/// any other single member is hoisted in place.
fn rewrite_nullable_composition(map: &mut Map<String, Value>) {
    for keyword in ["oneOf", "anyOf"] {
        let Some(Value::Array(members)) = map.get(keyword) else {
            continue;
        };
        let is_null = |v: &Value| v.get("type") == Some(&Value::String("null".to_string()));
        if !members.iter().any(is_null) {
            continue;
        }
        let concrete: Vec<Value> = members.iter().filter(|v| !is_null(v)).cloned().collect();
        map.remove(keyword);
        map.insert("nullable".to_string(), Value::Bool(true));
        match concrete.as_slice() {
            [single] if single.get("$ref").is_some() => {
                map.insert("allOf".to_string(), Value::Array(vec![single.clone()]));
            }
            [single] => {
                if let Value::Object(inner) = single {
                    for (k, v) in inner {
                        map.entry(k.clone()).or_insert_with(|| v.clone());
                    }
                }
            }
            _ => {
                map.insert(keyword.to_string(), Value::Array(concrete));
            }
        }
        return;
    }
}

/// `examples: [x, …]` → `example: x` (3.0 schema objects carry a singular
/// `example`, not the 3.1 `examples` array).
fn rewrite_examples_to_example(map: &mut Map<String, Value>) {
    let Some(Value::Array(examples)) = map.get("examples") else {
        return;
    };
    if let Some(first) = examples.first().cloned() {
        map.insert("example".to_string(), first);
    }
    map.remove("examples");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn emitted_document_is_openapi_30() {
        let value = openapi_30_value();
        let version = value
            .get("openapi")
            .and_then(Value::as_str)
            .expect("openapi field is a string");
        assert_eq!(version, OPENAPI_VERSION);
    }

    #[test]
    fn json_output_is_stable_and_newline_terminated() {
        let first = openapi_30_json();
        let second = openapi_30_json();
        assert_eq!(first, second, "emission must be deterministic");
        assert!(first.ends_with('\n'), "emitted JSON ends with a newline");
    }

    #[test]
    fn no_31_style_nullable_type_union_remains() {
        let json = openapi_30_json();
        assert!(
            !json.contains("\"null\""),
            "3.0 documents express nullability via the `nullable` keyword"
        );
    }

    #[test]
    fn nullable_union_is_rewritten_to_30_keyword() {
        let mut node = serde_json::json!({ "type": ["string", "null"] });
        rewrite_schema_node(&mut node);
        assert_eq!(node["type"], serde_json::json!("string"));
        assert_eq!(node["nullable"], serde_json::json!(true));
    }

    #[test]
    fn nullable_oneof_ref_is_rewritten_to_allof_plus_nullable() {
        let mut node = serde_json::json!({
            "oneOf": [{ "type": "null" }, { "$ref": "#/components/schemas/Setting" }]
        });
        rewrite_schema_node(&mut node);
        assert_eq!(node["nullable"], serde_json::json!(true));
        assert!(
            node.get("oneOf").is_none(),
            "the null union must be removed"
        );
        assert_eq!(
            node["allOf"],
            serde_json::json!([{ "$ref": "#/components/schemas/Setting" }]),
            "a single $ref member is wrapped in allOf so nullable has no $ref sibling"
        );
    }

    #[test]
    fn get_response_data_is_nullable_in_30() {
        let doc = openapi_30_value();
        let data = &doc["components"]["schemas"]["GetResponse"]["properties"]["data"];
        assert_eq!(
            data["nullable"],
            serde_json::json!(true),
            "GET /settings/:key returns a nullable setting; got {data}"
        );
    }
}
