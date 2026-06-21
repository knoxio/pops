//! Liveness + a stub root, mirroring the `/health` envelope every TS pillar
//! serves so the registry health check and the shell treat contacts
//! identically.

use axum::Json;
use serde::Serialize;
use utoipa::ToSchema;

use crate::app::AppState;

/// Contract descriptor embedded in the health envelope. The contract package
/// + version a consumer can expect from this pillar.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct HealthContract {
    pub package: &'static str,
    pub version: String,
}

/// `GET /health` response body. Shape matches the TS pillar health envelope
/// (`ok`, `status`, `pillar`, `version`, `contract`).
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct HealthResponse {
    pub ok: bool,
    pub status: &'static str,
    pub pillar: &'static str,
    pub version: String,
    pub contract: HealthContract,
}

/// Liveness probe.
#[utoipa::path(
    get,
    path = "/health",
    operation_id = "health.get",
    responses((status = 200, description = "Pillar is live", body = HealthResponse))
)]
pub async fn health(
    axum::extract::State(state): axum::extract::State<AppState>,
) -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        status: "ok",
        pillar: "contacts",
        version: state.version.clone(),
        contract: HealthContract {
            package: "@pops/contacts",
            version: state.version.clone(),
        },
    })
}

/// Stub root. A human-friendly landing string so `GET /` is not a 404 while
/// the real surface is still under construction.
#[utoipa::path(
    get,
    path = "/",
    operation_id = "root.get",
    responses((status = 200, description = "Pillar identity banner", body = String))
)]
pub async fn root() -> &'static str {
    "pops contacts pillar"
}
