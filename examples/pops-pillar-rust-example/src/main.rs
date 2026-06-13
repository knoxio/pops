//! POPS wire-format v1 reference pillar (Rust).
//!
//! See `docs/themes/13-pillar-finale/specs/pillar-wire-format-v1.md` for the
//! canonical spec this implements. If anything here disagrees with the spec,
//! the spec wins.

use std::{env, net::SocketAddr, sync::Arc, time::Duration};

use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use tracing::{error, info, warn};

const PILLAR_ID: &str = "example-rust";
const PILLAR_VERSION: &str = "0.1.0";
const WIRE_VERSION_HEADER: &str = "x-pops-wire-version";
const REQUEST_ID_HEADER: &str = "x-request-id";
const INTERNAL_KEY_HEADER: &str = "X-Internal-API-Key";
const SUPPORTED_WIRE_VERSIONS: &[u32] = &[1];

#[derive(Clone)]
struct AppState {
    manifest: Arc<Value>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(3010);
    let addr: SocketAddr = ([0, 0, 0, 0], port).into();

    let manifest = Arc::new(build_manifest());
    let state = AppState {
        manifest: manifest.clone(),
    };

    let app = Router::new()
        .route("/manifest.json", get(manifest_handler))
        .route("/health", get(health_handler))
        .route("/trpc/examplerust.hello.greet", post(greet_handler))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind listener");
    info!(%addr, pillar = PILLAR_ID, "rust reference pillar listening");

    let base_url = env::var("POPS_PILLAR_BASE_URL")
        .unwrap_or_else(|_| format!("http://{}:{}", PILLAR_ID, port));
    tokio::spawn(register_on_boot(base_url, manifest));

    axum::serve(listener, app).await.expect("serve");
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

fn build_manifest() -> Value {
    json!({
        "pillar": PILLAR_ID,
        "version": PILLAR_VERSION,
        "contract": {
            "package": "@pops/example-rust-contract",
            "version": PILLAR_VERSION,
            "tag": format!("contract-example-rust@v{}", PILLAR_VERSION),
        },
        "routes": {
            "queries": ["examplerust.hello.greet"],
            "mutations": [],
            "subscriptions": [],
        },
        "search": { "adapters": [] },
        "ai": { "tools": [] },
        "uri": { "types": [] },
        "settings": { "keys": [] },
        "healthcheck": { "path": "/health" },
    })
}

async fn manifest_handler(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if let Some(rejection) = enforce_wire_version(&headers) {
        return rejection;
    }
    let mut response = Json(state.manifest.as_ref().clone()).into_response();
    let h = response.headers_mut();
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    echo_request_id(&headers, h);
    response
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct HealthQuery {
    simulate: Option<String>,
}

async fn health_handler(Query(q): Query<HealthQuery>, headers: HeaderMap) -> Response {
    let now = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".into());

    if q.simulate.as_deref() == Some("unhealthy") {
        let body = json!({
            "ok": false,
            "status": "unhealthy",
            "pillar": PILLAR_ID,
            "version": PILLAR_VERSION,
            "ts": now,
            "reason": "simulated by ?simulate=unhealthy",
        });
        let mut response = (StatusCode::SERVICE_UNAVAILABLE, Json(body)).into_response();
        echo_request_id(&headers, response.headers_mut());
        return response;
    }

    let body = json!({
        "ok": true,
        "status": "healthy",
        "pillar": PILLAR_ID,
        "version": PILLAR_VERSION,
        "ts": now,
    });
    let mut response = Json(body).into_response();
    echo_request_id(&headers, response.headers_mut());
    response
}

// ---------------------------------------------------------------------------
// Greet procedure — the minimal happy-path tRPC handler
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct TrpcBody {
    input: Option<Value>,
}

async fn greet_handler(headers: HeaderMap, body: Option<Json<Value>>) -> Response {
    if let Some(rejection) = enforce_wire_version(&headers) {
        return rejection;
    }
    let parsed: TrpcBody = match body {
        Some(Json(raw)) => match serde_json::from_value(raw) {
            Ok(v) => v,
            Err(_) => return trpc_error(StatusCode::OK, "BAD_REQUEST", "malformed envelope", &headers),
        },
        None => return trpc_error(StatusCode::OK, "BAD_REQUEST", "missing body", &headers),
    };
    if parsed.input.is_none() {
        return trpc_error(StatusCode::OK, "BAD_REQUEST", "missing input field", &headers);
    }
    let body = json!({
        "result": {
            "data": { "greeting": "hello from rust" }
        }
    });
    let mut response = Json(body).into_response();
    echo_request_id(&headers, response.headers_mut());
    response
}

fn trpc_error(status: StatusCode, code: &str, message: &str, req_headers: &HeaderMap) -> Response {
    let body = json!({
        "error": {
            "code": code,
            "message": message,
            "data": {
                "code": code,
                "httpStatus": status.as_u16(),
                "path": "examplerust.hello.greet",
            }
        }
    });
    let mut response = (status, Json(body)).into_response();
    echo_request_id(req_headers, response.headers_mut());
    response
}

fn enforce_wire_version(headers: &HeaderMap) -> Option<Response> {
    let raw = headers.get(WIRE_VERSION_HEADER)?.to_str().ok()?;
    let version: u32 = raw.parse().ok()?;
    if SUPPORTED_WIRE_VERSIONS.contains(&version) {
        return None;
    }
    let body = json!({
        "error": {
            "code": "METHOD_NOT_SUPPORTED",
            "message": format!("wire version {} is not supported", version),
            "data": {
                "code": "METHOD_NOT_SUPPORTED",
                "httpStatus": 405,
                "supportedVersions": SUPPORTED_WIRE_VERSIONS,
            }
        }
    });
    let mut response = (StatusCode::OK, Json(body)).into_response();
    echo_request_id(headers, response.headers_mut());
    Some(response)
}

fn echo_request_id(req_headers: &HeaderMap, out: &mut HeaderMap) {
    if let Some(rid) = req_headers.get(REQUEST_ID_HEADER) {
        out.insert(REQUEST_ID_HEADER, rid.clone());
    }
}

// ---------------------------------------------------------------------------
// Boot-time registration — §6 of the spec
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct RegisterPayload<'a> {
    input: RegisterInput<'a>,
}

#[derive(Serialize)]
struct RegisterInput<'a> {
    #[serde(rename = "pillarId")]
    pillar_id: &'a str,
    #[serde(rename = "baseUrl")]
    base_url: &'a str,
    manifest: &'a Value,
    #[serde(rename = "apiKey")]
    api_key: &'a str,
}

async fn register_on_boot(base_url: String, manifest: Arc<Value>) {
    let core_base = match env::var("POPS_CORE_BASE_URL") {
        Ok(v) => v,
        Err(_) => {
            warn!("POPS_CORE_BASE_URL not set — skipping registration (run-as-fixture mode)");
            return;
        }
    };
    let api_key = match env::var("POPS_INTERNAL_API_KEY") {
        Ok(v) => v,
        Err(_) => {
            error!("POPS_INTERNAL_API_KEY not set — aborting registration");
            return;
        }
    };

    let url = format!("{}/trpc/core.registry.register", core_base.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .expect("reqwest client");

    let deadline = std::time::Instant::now() + Duration::from_secs(5 * 60);
    let mut attempt: u32 = 0;
    let mut base_delay_ms: u64 = 1_000;

    loop {
        attempt += 1;
        let payload = RegisterPayload {
            input: RegisterInput {
                pillar_id: PILLAR_ID,
                base_url: &base_url,
                manifest: manifest.as_ref(),
                api_key: &api_key,
            },
        };
        let req = client
            .post(&url)
            .header(INTERNAL_KEY_HEADER, &api_key)
            .header(WIRE_VERSION_HEADER, "1")
            .header(REQUEST_ID_HEADER, uuid::Uuid::new_v4().to_string())
            .json(&payload);

        match req.send().await {
            Ok(res) => {
                let status = res.status();
                let body: Value = res.json().await.unwrap_or_else(|_| Value::Null);
                if status.is_success() && registration_ok(&body) {
                    info!(attempt, "registration succeeded");
                    return;
                }
                if let Some(code) = body
                    .get("error")
                    .and_then(|e| e.get("code"))
                    .and_then(|c| c.as_str())
                {
                    if code == "UNAUTHORIZED" {
                        error!("registration rejected with UNAUTHORIZED — fix POPS_INTERNAL_API_KEY; not retrying");
                        return;
                    }
                    if code == "BAD_REQUEST" {
                        error!(?body, "registration rejected with BAD_REQUEST — manifest invalid; not retrying");
                        return;
                    }
                }
                warn!(attempt, ?status, ?body, "registration failed; will retry");
            }
            Err(err) => {
                warn!(attempt, %err, "registration network error; will retry");
            }
        }

        if std::time::Instant::now() >= deadline {
            error!("registration deadline (5 minutes) exhausted — giving up");
            return;
        }
        let jitter_ms: u64 = rand::thread_rng().gen_range(0..=base_delay_ms);
        tokio::time::sleep(Duration::from_millis(jitter_ms)).await;
        base_delay_ms = (base_delay_ms.saturating_mul(2)).min(30_000);
    }
}

fn registration_ok(body: &Value) -> bool {
    body.get("result")
        .and_then(|r| r.get("data"))
        .and_then(|d| d.get("ok"))
        .and_then(|ok| ok.as_bool())
        .unwrap_or(false)
}
