//! Integration test for the registry transport against a REAL HTTP mock
//! registry (a throwaway axum server on an ephemeral port).
//!
//! This complements the unit tests (which use an in-process fake): here the
//! actual `reqwest`-backed `HttpRegistryTransport` makes real TCP requests, so
//! the slash-first → legacy-404 fallback, the JSON body shape, and the
//! register/heartbeat/deregister envelopes are all exercised end-to-end. It
//! mirrors the plan's Gate G2 ("spin a mock registry and assert contacts POSTs
//! a schema-valid manifest, heartbeats, deregisters").

use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::post;
use axum::{Json, Router};
use serde_json::{json, Value};
use tokio::net::TcpListener;

use contacts::manifest::build_contacts_manifest;
use contacts::registry::{HttpRegistryTransport, RegistryTransport};

/// Records every register/heartbeat/deregister call the mock registry saw.
#[derive(Default)]
struct RegistryLog {
    register_paths: Vec<String>,
    register_bodies: Vec<Value>,
    heartbeat_bodies: Vec<Value>,
    deregister_bodies: Vec<Value>,
}

#[derive(Clone)]
struct MockState {
    log: Arc<Mutex<RegistryLog>>,
    /// When true, the canonical slash register path returns 404 so the
    /// transport must fall back to the legacy dotted path.
    canonical_register_404: bool,
}

async fn handle_register_canonical(
    State(state): State<MockState>,
    Json(body): Json<Value>,
) -> (StatusCode, Json<Value>) {
    if state.canonical_register_404 {
        return (StatusCode::NOT_FOUND, Json(json!({ "error": "not found" })));
    }
    record_register(&state, "/registry/register", body)
}

async fn handle_register_legacy(
    State(state): State<MockState>,
    Json(body): Json<Value>,
) -> (StatusCode, Json<Value>) {
    record_register(&state, "/core.registry.register", body)
}

fn record_register(state: &MockState, path: &str, body: Value) -> (StatusCode, Json<Value>) {
    let pillar_id = body
        .get("pillarId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    {
        let mut log = state.log.lock().unwrap();
        log.register_paths.push(path.to_string());
        log.register_bodies.push(body);
    }
    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "pillarId": pillar_id,
            "registeredAt": "2026-06-22T00:00:00.000Z",
            "heartbeatIntervalMs": 10_000,
        })),
    )
}

async fn handle_heartbeat(State(state): State<MockState>, Json(body): Json<Value>) -> Json<Value> {
    let pillar_id = body
        .get("pillarId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    state.log.lock().unwrap().heartbeat_bodies.push(body);
    Json(json!({ "ok": true, "pillarId": pillar_id }))
}

async fn handle_deregister(State(state): State<MockState>, Json(body): Json<Value>) -> Json<Value> {
    state.log.lock().unwrap().deregister_bodies.push(body);
    Json(json!({ "ok": true }))
}

/// Boot the mock registry on an ephemeral port; return its base URL and the
/// shared log. The server task is detached and dies with the test process.
async fn spawn_mock_registry(canonical_register_404: bool) -> (String, Arc<Mutex<RegistryLog>>) {
    let log = Arc::new(Mutex::new(RegistryLog::default()));
    let state = MockState {
        log: Arc::clone(&log),
        canonical_register_404,
    };

    let router = Router::new()
        .route("/registry/register", post(handle_register_canonical))
        .route("/registry/heartbeat", post(handle_heartbeat))
        .route("/registry/deregister", post(handle_deregister))
        .route("/core.registry.register", post(handle_register_legacy))
        .route("/core.registry.heartbeat", post(handle_heartbeat))
        .route("/core.registry.deregister", post(handle_deregister))
        .with_state(state);

    let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
        .await
        .expect("bind ephemeral port");
    let addr = listener.local_addr().expect("resolve bound addr");
    tokio::spawn(async move {
        axum::serve(listener, router).await.ok();
    });

    (format!("http://{addr}"), log)
}

#[tokio::test]
async fn register_posts_a_schema_shaped_manifest_to_the_canonical_path() {
    let (base_url, log) = spawn_mock_registry(false).await;
    let transport = HttpRegistryTransport::new(base_url);
    let manifest = build_contacts_manifest("1.2.3");

    transport
        .register("http://contacts-api:3010", &manifest)
        .await
        .expect("register succeeds against the mock registry");

    let log = log.lock().unwrap();
    assert_eq!(
        log.register_paths,
        vec!["/registry/register".to_string()],
        "the canonical slash path is tried first and wins"
    );

    let body = &log.register_bodies[0];
    assert_eq!(body["pillarId"], json!("contacts"));
    assert_eq!(body["baseUrl"], json!("http://contacts-api:3010"));
    // The manifest is pushed verbatim in the register envelope.
    assert_eq!(body["manifest"]["pillar"], json!("contacts"));
    assert_eq!(body["manifest"]["version"], json!("1.2.3"));
    assert_eq!(
        body["manifest"]["healthcheck"]["path"],
        json!("/health"),
        "the registry health probe reads the declared path"
    );
    assert_eq!(
        body["manifest"]["search"]["adapters"][0]["procedurePath"],
        json!("contacts.search.search")
    );
}

#[tokio::test]
async fn register_falls_back_to_the_legacy_path_on_a_canonical_404() {
    let (base_url, log) = spawn_mock_registry(true).await;
    let transport = HttpRegistryTransport::new(base_url);
    let manifest = build_contacts_manifest("1.2.3");

    transport
        .register("http://contacts-api:3010", &manifest)
        .await
        .expect("register falls back to legacy and succeeds");

    let log = log.lock().unwrap();
    assert_eq!(
        log.register_paths,
        vec!["/core.registry.register".to_string()],
        "the canonical path 404s, so the legacy dotted path is used"
    );
    assert_eq!(log.register_bodies[0]["pillarId"], json!("contacts"));
}

#[tokio::test]
async fn heartbeat_and_deregister_round_trip_over_real_http() {
    let (base_url, log) = spawn_mock_registry(false).await;
    let transport = HttpRegistryTransport::new(base_url);

    transport
        .heartbeat("contacts")
        .await
        .expect("heartbeat succeeds");
    transport
        .deregister("contacts")
        .await
        .expect("deregister succeeds");

    let log = log.lock().unwrap();
    assert_eq!(log.heartbeat_bodies.len(), 1);
    assert_eq!(log.heartbeat_bodies[0]["pillarId"], json!("contacts"));
    assert_eq!(log.deregister_bodies.len(), 1);
    assert_eq!(log.deregister_bodies[0]["pillarId"], json!("contacts"));
}
