//! OpenAPI document generation, pinned to **OpenAPI 3.0.3**.
//!
//! ## Why a downgrade pass exists
//!
//! utoipa 5 emits OpenAPI **3.1** by default, but the repo's client
//! generator (`@hey-api/openapi-ts`, the same pipeline every TS pillar's
//! frontend uses) targets **3.0**. A 3.1 document breaks client generation.
//! The TS pillars solve this with `z.toJSONSchema({ target: 'openapi-3.0' })`;
//! the Rust side mirrors that intent with a deterministic post-process pass
//! that rewrites the serialized document to a 3.0.3 shape. The two 3.1→3.0
//! shape differences utoipa can emit are handled:
//!
//!   - `type: ["string", "null"]` (3.1 nullable union) → `type: "string"` +
//!     `nullable: true` (3.0 keyword).
//!   - `examples` (3.1 array) → `example` (3.0 singular) on schema objects.
//!
//! The `openapi` version field is forced to `3.0.3`. `emit-openapi` writes
//! the result to `openapi/contacts.openapi.json`; a drift check (regenerate
//! + `git diff --exit-code`) keeps the committed copy honest.

use serde_json::{Map, Value};
use utoipa::OpenApi;

use crate::health::{health, root, HealthContract, HealthResponse};

/// The contacts OpenAPI surface. N0 documents `/health` and the stub root;
/// the entities/search/settings paths join in later nodes.
#[derive(OpenApi)]
#[openapi(
    info(
        title = "POPS Contacts",
        description = "Contacts pillar — authoritative entities store (first Rust pillar)."
    ),
    paths(health, root),
    components(schemas(HealthResponse, HealthContract))
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
/// newline (so the committed file is diff-stable across regenerations).
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
        assert!(
            version.starts_with("3.0"),
            "OpenAPI must be 3.0.x for hey-api, got {version}"
        );
        assert_eq!(version, OPENAPI_VERSION);
    }

    #[test]
    fn document_advertises_the_health_path() {
        let value = openapi_30_value();
        assert!(
            value.pointer("/paths/~1health").is_some(),
            "/health path must be present in the OpenAPI document"
        );
    }

    #[test]
    fn json_output_is_stable_and_newline_terminated() {
        let first = openapi_30_json();
        let second = openapi_30_json();
        assert_eq!(first, second, "emission must be deterministic");
        assert!(first.ends_with('\n'), "committed JSON ends with a newline");
    }

    #[test]
    fn no_31_style_nullable_type_union_remains() {
        let json = openapi_30_json();
        assert!(
            !json.contains("\"null\""),
            "3.0 documents express nullability via the `nullable` keyword, not a null type"
        );
    }

    #[test]
    fn nullable_union_is_rewritten_to_30_keyword() {
        let mut node = serde_json::json!({ "type": ["string", "null"] });
        rewrite_schema_node(&mut node);
        assert_eq!(node["type"], serde_json::json!("string"));
        assert_eq!(node["nullable"], serde_json::json!(true));
    }
}
