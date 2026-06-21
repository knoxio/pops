//! End-to-end exercise of the contacts router against a temp in-memory DB.
//!
//! Drives the assembled axum app through `tower::ServiceExt::oneshot`, so the
//! full request → handler → serialization path is covered (not just the
//! handler functions in isolation).

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

use contacts::app::{build_router, AppState};
use contacts::db;

async fn test_app() -> axum::Router {
    let pool = db::connect("sqlite::memory:")
        .await
        .expect("in-memory pool connects and migrates");
    build_router(AppState {
        pool,
        version: "1.2.3-test".to_string(),
    })
}

async fn json_body(response: axum::response::Response) -> Value {
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("response body collects")
        .to_bytes();
    serde_json::from_slice(&bytes).expect("response body is JSON")
}

#[tokio::test]
async fn health_returns_the_ok_envelope() {
    let app = test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .expect("router responds");

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    assert_eq!(body["ok"], Value::Bool(true));
    assert_eq!(body["status"], "ok");
    assert_eq!(body["pillar"], "contacts");
    assert_eq!(body["version"], "1.2.3-test");
    assert_eq!(body["contract"]["package"], "@pops/contacts");
}

#[tokio::test]
async fn openapi_endpoint_serves_a_30_document() {
    let app = test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/openapi")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .expect("router responds");

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    let version = body["openapi"]
        .as_str()
        .expect("openapi version is a string");
    assert!(
        version.starts_with("3.0"),
        "served OpenAPI must be 3.0.x, got {version}"
    );
    assert!(
        body.pointer("/paths/~1health").is_some(),
        "served document advertises the /health path"
    );
}

#[tokio::test]
async fn root_serves_the_identity_banner() {
    let app = test_app().await;
    let response = app
        .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
        .await
        .expect("router responds");

    assert_eq!(response.status(), StatusCode::OK);
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("body collects")
        .to_bytes();
    assert_eq!(&bytes[..], b"pops contacts pillar");
}
