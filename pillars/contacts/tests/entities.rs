//! Per-route integration tests for the entities CRUD + bulk-lookup + search
//! surface, driving the fully assembled axum router through
//! `tower::ServiceExt::oneshot` against a migrated in-memory SQLite DB. These
//! exercise the whole request → handler → DB → serialization path, including
//! status codes and the JSON wire shape, not just the repo functions in
//! isolation.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

use contacts::app::{build_router, AppState};
use contacts::db;

async fn app() -> axum::Router {
    let pool = db::connect("sqlite::memory:")
        .await
        .expect("in-memory pool connects and migrates");
    build_router(AppState {
        pool,
        version: "1.2.3-test".to_string(),
    })
}

async fn send(app: &axum::Router, req: Request<Body>) -> (StatusCode, Value) {
    let response = app.clone().oneshot(req).await.expect("router responds");
    let status = response.status();
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("body collects")
        .to_bytes();
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).expect("response body is JSON")
    };
    (status, body)
}

fn post(path: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(path)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

fn patch(path: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method("PATCH")
        .uri(path)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

fn get(path: &str) -> Request<Body> {
    Request::builder().uri(path).body(Body::empty()).unwrap()
}

fn delete(path: &str) -> Request<Body> {
    Request::builder()
        .method("DELETE")
        .uri(path)
        .body(Body::empty())
        .unwrap()
}

async fn create_contact(app: &axum::Router, body: Value) -> Value {
    let (status, body) = send(app, post("/entities", body)).await;
    assert_eq!(status, StatusCode::CREATED, "create returns 201: {body}");
    body["data"].clone()
}

#[tokio::test]
async fn create_returns_201_with_the_projected_entity() {
    let app = app().await;
    let data = create_contact(
        &app,
        json!({
            "name": "Acme",
            "type": "company",
            "abn": "123",
            "aliases": ["ACME Corp", "Acme Inc"],
            "defaultTags": ["vendor"],
            "notes": "primary supplier"
        }),
    )
    .await;

    assert!(data["id"].as_str().is_some());
    assert_eq!(data["name"], "Acme");
    assert_eq!(data["type"], "company");
    assert_eq!(data["abn"], "123");
    assert_eq!(data["aliases"], json!(["ACME Corp", "Acme Inc"]));
    assert_eq!(data["defaultTags"], json!(["vendor"]));
    assert!(data["lastEditedTime"].as_str().unwrap().ends_with('Z'));
    assert!(
        data.get("notionId").is_none(),
        "the integration columns are never exposed on the wire"
    );
    assert!(data.get("ownerUri").is_none());
}

#[tokio::test]
async fn create_defaults_type_to_company() {
    let app = app().await;
    let data = create_contact(&app, json!({ "name": "NoType" })).await;
    assert_eq!(data["type"], "company");
    assert_eq!(data["aliases"], json!([]));
    assert_eq!(data["defaultTags"], json!([]));
    assert_eq!(data["abn"], Value::Null);
}

#[tokio::test]
async fn duplicate_name_create_is_a_409() {
    let app = app().await;
    create_contact(&app, json!({ "name": "Dup" })).await;
    let (status, body) = send(&app, post("/entities", json!({ "name": "Dup" }))).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["code"], "ConflictError");
    assert!(body["message"].as_str().unwrap().contains("Dup"));
}

#[tokio::test]
async fn empty_name_create_is_a_400() {
    let app = app().await;
    let (status, _) = send(&app, post("/entities", json!({ "name": "   " }))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn invalid_type_create_is_a_400() {
    let app = app().await;
    let (status, body) = send(
        &app,
        post("/entities", json!({ "name": "X", "type": "wizard" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["message"].as_str().unwrap().contains("wizard"));
}

#[tokio::test]
async fn get_returns_the_entity_then_404_after_delete() {
    let app = app().await;
    let created = create_contact(&app, json!({ "name": "Gettable" })).await;
    let id = created["id"].as_str().unwrap();

    let (status, body) = send(&app, get(&format!("/entities/{id}"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["name"], "Gettable");

    let (status, body) = send(&app, delete(&format!("/entities/{id}"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["message"], "Entity deleted");

    let (status, _) = send(&app, get(&format!("/entities/{id}"))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn get_unknown_id_is_a_404() {
    let app = app().await;
    let (status, body) = send(&app, get("/entities/nope")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["code"], "NotFoundError");
}

#[tokio::test]
async fn delete_unknown_id_is_a_404() {
    let app = app().await;
    let (status, _) = send(&app, delete("/entities/nope")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn list_filters_paginates_and_orders_case_insensitively() {
    let app = app().await;
    for (name, ty) in [
        ("zebra", "company"),
        ("Apple", "person"),
        ("apricot", "company"),
    ] {
        create_contact(&app, json!({ "name": name, "type": ty })).await;
    }

    let (status, body) = send(&app, get("/entities")).await;
    assert_eq!(status, StatusCode::OK);
    let names: Vec<&str> = body["data"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, vec!["Apple", "apricot", "zebra"]);
    assert_eq!(body["pagination"]["total"], 3);
    assert_eq!(body["pagination"]["hasMore"], false);

    let (_, body) = send(&app, get("/entities?search=ap")).await;
    assert_eq!(body["pagination"]["total"], 2);

    let (_, body) = send(&app, get("/entities?type=person")).await;
    assert_eq!(body["pagination"]["total"], 1);
    assert_eq!(body["data"][0]["name"], "Apple");

    let (_, body) = send(&app, get("/entities?limit=2&offset=0")).await;
    assert_eq!(body["data"].as_array().unwrap().len(), 2);
    assert_eq!(body["pagination"]["hasMore"], true);
}

#[tokio::test]
async fn list_rejects_an_invalid_type_filter() {
    let app = app().await;
    let (status, _) = send(&app, get("/entities?type=wizard")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn patch_applies_partial_changes_and_can_clear_nullable_fields() {
    let app = app().await;
    let created = create_contact(
        &app,
        json!({ "name": "Patchable", "abn": "999", "notes": "old" }),
    )
    .await;
    let id = created["id"].as_str().unwrap();

    let (status, body) = send(
        &app,
        patch(
            &format!("/entities/{id}"),
            json!({ "notes": "new", "abn": null, "aliases": ["x"] }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["notes"], "new");
    assert_eq!(body["data"]["abn"], Value::Null);
    assert_eq!(body["data"]["aliases"], json!(["x"]));
    assert_eq!(body["data"]["name"], "Patchable");
}

#[tokio::test]
async fn patch_rename_to_existing_name_is_a_409() {
    let app = app().await;
    create_contact(&app, json!({ "name": "First" })).await;
    let second = create_contact(&app, json!({ "name": "Second" })).await;
    let id = second["id"].as_str().unwrap();

    let (status, _) = send(
        &app,
        patch(&format!("/entities/{id}"), json!({ "name": "First" })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
}

#[tokio::test]
async fn patch_unknown_id_is_a_404() {
    let app = app().await;
    let (status, _) = send(&app, patch("/entities/nope", json!({ "notes": "x" }))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn bulk_lookup_returns_the_whole_match_set() {
    let app = app().await;
    create_contact(&app, json!({ "name": "Acme", "aliases": ["ACME Corp"] })).await;
    create_contact(&app, json!({ "name": "Beta" })).await;

    let (status, body) = send(&app, post("/entities/lookup", json!({}))).await;
    assert_eq!(status, StatusCode::OK);
    let entities = body["entities"].as_array().unwrap();
    assert_eq!(entities.len(), 2);
    assert!(body["fetchedAt"].as_str().unwrap().ends_with('Z'));

    let acme = entities.iter().find(|e| e["name"] == "Acme").unwrap();
    assert_eq!(acme["aliases"], json!(["ACME Corp"]));
    assert!(
        acme.get("notes").is_none(),
        "lookup returns only the match columns (id, name, aliases)"
    );
}

#[tokio::test]
async fn search_ranks_and_caps_hits() {
    let app = app().await;
    for name in ["Acme", "Acme Corp", "The Acme Group", "Unrelated"] {
        create_contact(&app, json!({ "name": name })).await;
    }

    let (status, body) = send(
        &app,
        post("/search", json!({ "query": { "text": "Acme" } })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let hits = body["hits"].as_array().unwrap();
    assert_eq!(hits.len(), 3, "Unrelated does not contain the term");

    assert_eq!(hits[0]["data"]["name"], "Acme");
    assert_eq!(hits[0]["score"], 1.0);
    assert_eq!(hits[0]["matchType"], "exact");
    assert!(hits[0]["uri"]
        .as_str()
        .unwrap()
        .starts_with("pops:contacts/contact/"));

    let scores: Vec<f64> = hits.iter().map(|h| h["score"].as_f64().unwrap()).collect();
    assert!(
        scores.windows(2).all(|w| w[0] >= w[1]),
        "hits are sorted by descending score: {scores:?}"
    );
}

#[tokio::test]
async fn search_with_empty_text_returns_no_hits() {
    let app = app().await;
    create_contact(&app, json!({ "name": "Acme" })).await;
    let (status, body) = send(&app, post("/search", json!({ "query": { "text": "  " } }))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["hits"], json!([]));
}
