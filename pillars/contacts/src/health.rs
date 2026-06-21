//! Liveness + a stub root, mirroring the `/health` envelope every TS pillar
//! serves (`ok`, `status`, `pillar`, `version`, `ts`) so the registry health
//! check and the shell treat contacts identically.

use axum::Json;
use serde::Serialize;
use utoipa::ToSchema;

use crate::app::AppState;
use crate::time::now_rfc3339;

/// `GET /health` response body. Field-for-field identical to the TS pillar
/// health envelope: `ok`, `status`, `pillar`, `version`, `ts` (an RFC 3339 /
/// ISO 8601 UTC timestamp, matching the TS `new Date().toISOString()`). The
/// registry health probe parses this shape across every pillar.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct HealthResponse {
    pub ok: bool,
    pub status: &'static str,
    pub pillar: &'static str,
    pub version: String,
    pub ts: String,
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
        ts: now_rfc3339(),
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
