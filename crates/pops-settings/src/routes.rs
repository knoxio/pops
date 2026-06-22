//! Axum routes for the federated RU+reset settings surface, with the utoipa
//! `operation_id` pinned to the DOT-form on every path.
//!
//! Every `#[utoipa::path]` pins `operation_id` to the DOTTED `settings.<proc>`
//! string (`settings.list`, `settings.get`, `settings.getMany`,
//! `settings.set`, `settings.setMany`, `settings.resetKey`, `settings.reset`,
//! and the internal `settings.ensure`). This is load-bearing (mustFix #2 /
//! crossPlanConflict #1 in `docs/plans/02-settings-federation.md`): the ts-rest
//! projection emits the same dot-form ids, so the contacts pillar's generated
//! hey-api client derives identical method names to every TS pillar and the
//! single contacts OpenAPI doc never mixes two operationId styles. utoipa's
//! default id is the fn name (which cannot contain a dot), hence the explicit
//! override on each route.
//!
//! The handler bodies are intentionally thin: the crate ships standalone (no
//! in-tree DB/identity wiring yet — the contacts pillar supplies that when it
//! mounts the surface), so these document the wire shape and pin the
//! operationIds. The persistence-bearing logic lives in
//! [`SettingsHandlers`](crate::handlers::SettingsHandlers).

use std::sync::{Arc, Mutex};

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};

use crate::handlers::{HandlerError, SettingsGate, SettingsHandlers};
use crate::service::SettingsStore;
use crate::wire::{
    EnsureResponse, GetManyRequest, GetResponse, ListResponse, MutationResponse, ResetRequest,
    ResetResponse, SetManyRequest, SettingValueBody, SettingsMapResponse,
};

/// The shared state a mounting pillar supplies: the bound [`SettingsHandlers`]
/// plus the principal to gate each request against. The pillar's real adapter
/// extracts the principal per request; this standalone shape carries one so the
/// handlers compile and document the wire end to end.
pub struct SettingsState<S, G>
where
    G: SettingsGate,
{
    /// The bound handlers (store + key authority + scope prefix + gate).
    pub handlers: Arc<Mutex<SettingsHandlers<S, G>>>,
    /// The principal each route gates against.
    pub principal: G::Principal,
}

impl<S, G> Clone for SettingsState<S, G>
where
    G: SettingsGate,
    G::Principal: Clone,
{
    fn clone(&self) -> Self {
        Self {
            handlers: Arc::clone(&self.handlers),
            principal: self.principal.clone(),
        }
    }
}

/// Mounts the RU+reset routes onto a router sharing a [`SettingsState`].
///
/// The paths are byte-identical to the TS contract (`contract.ts`): `list`
/// (`GET /settings`), `get` (`GET /settings/:key`), `getMany`
/// (`POST /settings/get-many`), `set` (`PUT /settings/:key`), `setMany`
/// (`POST /settings/set-many`), `resetKey` (`POST /settings/:key/reset`),
/// `reset` (`POST /settings/reset`), and the internal `ensure`
/// (`POST /settings/:key/ensure`). There is deliberately NO create and NO
/// delete route — DELETE is an alias for reset.
pub fn settings_router<S, G>() -> Router<SettingsState<S, G>>
where
    S: SettingsStore + Send + 'static,
    G: SettingsGate + Send + 'static,
    G::Principal: Clone + Send + Sync + 'static,
    G::Denied: Send + 'static,
{
    Router::new()
        .route("/settings", get(list::<S, G>))
        .route("/settings/get-many", post(get_many::<S, G>))
        .route("/settings/set-many", post(set_many::<S, G>))
        .route("/settings/reset", post(reset::<S, G>))
        .route("/settings/:key", get(get_one::<S, G>).put(set::<S, G>))
        .route("/settings/:key/reset", post(reset_key::<S, G>))
        .route("/settings/:key/ensure", post(ensure::<S, G>))
}

/// Maps a handler failure to an HTTP status: a gate denial is `401`, an
/// undeclared key is `400`.
fn status_for<D>(err: &HandlerError<D>) -> StatusCode {
    match err {
        HandlerError::Denied(_) => StatusCode::UNAUTHORIZED,
        HandlerError::UnknownKey(_) => StatusCode::BAD_REQUEST,
    }
}

#[utoipa::path(
    get,
    path = "/settings",
    operation_id = "settings.list",
    responses((status = 200, description = "Effective value for every declared key (sensitive redacted)", body = ListResponse))
)]
pub async fn list<S, G>(
    State(state): State<SettingsState<S, G>>,
) -> Result<Json<ListResponse>, StatusCode>
where
    S: SettingsStore,
    G: SettingsGate,
{
    let handlers = state.handlers.lock().expect("settings handlers lock");
    let data = handlers
        .list(&state.principal)
        .map_err(|e| status_for(&e))?;
    Ok(Json(ListResponse { data }))
}

#[utoipa::path(
    get,
    path = "/settings/{key}",
    operation_id = "settings.get",
    params(("key" = String, Path, description = "Declared setting key")),
    responses((status = 200, description = "A single setting (null on unset; sensitive redacted)", body = GetResponse))
)]
pub async fn get_one<S, G>(
    State(state): State<SettingsState<S, G>>,
    Path(key): Path<String>,
) -> Result<Json<GetResponse>, StatusCode>
where
    S: SettingsStore,
    G: SettingsGate,
{
    let handlers = state.handlers.lock().expect("settings handlers lock");
    let data = handlers
        .get(&state.principal, &key)
        .map_err(|e| status_for(&e))?;
    Ok(Json(GetResponse { data }))
}

#[utoipa::path(
    post,
    path = "/settings/get-many",
    operation_id = "settings.getMany",
    request_body = GetManyRequest,
    responses((status = 200, description = "Batch-read settings by key (missing omitted; sensitive redacted)", body = SettingsMapResponse))
)]
pub async fn get_many<S, G>(
    State(state): State<SettingsState<S, G>>,
    Json(body): Json<GetManyRequest>,
) -> Result<Json<SettingsMapResponse>, StatusCode>
where
    S: SettingsStore,
    G: SettingsGate,
{
    let handlers = state.handlers.lock().expect("settings handlers lock");
    let settings = handlers
        .get_many(&state.principal, &body.keys)
        .map_err(|e| status_for(&e))?;
    Ok(Json(SettingsMapResponse { settings }))
}

#[utoipa::path(
    put,
    path = "/settings/{key}",
    operation_id = "settings.set",
    params(("key" = String, Path, description = "Declared setting key")),
    request_body = SettingValueBody,
    responses((status = 200, description = "Upsert a single declared setting", body = MutationResponse))
)]
pub async fn set<S, G>(
    State(state): State<SettingsState<S, G>>,
    Path(key): Path<String>,
    Json(body): Json<SettingValueBody>,
) -> Result<Json<MutationResponse>, StatusCode>
where
    S: SettingsStore,
    G: SettingsGate,
{
    let mut handlers = state.handlers.lock().expect("settings handlers lock");
    let data = handlers
        .set(&state.principal, &key, &body.value)
        .map_err(|e| status_for(&e))?;
    Ok(Json(MutationResponse {
        data,
        message: "Setting saved".to_string(),
    }))
}

#[utoipa::path(
    post,
    path = "/settings/set-many",
    operation_id = "settings.setMany",
    request_body = SetManyRequest,
    responses((status = 200, description = "Transactional batch write (all-or-nothing); returns the written mirror", body = SettingsMapResponse))
)]
pub async fn set_many<S, G>(
    State(state): State<SettingsState<S, G>>,
    Json(body): Json<SetManyRequest>,
) -> Result<Json<SettingsMapResponse>, StatusCode>
where
    S: SettingsStore,
    G: SettingsGate,
{
    let mut handlers = state.handlers.lock().expect("settings handlers lock");
    let settings = handlers
        .set_many(&state.principal, &body.entries)
        .map_err(|e| status_for(&e))?;
    Ok(Json(SettingsMapResponse { settings }))
}

#[utoipa::path(
    post,
    path = "/settings/{key}/reset",
    operation_id = "settings.resetKey",
    params(("key" = String, Path, description = "Declared setting key")),
    responses((status = 200, description = "Reset a single setting to its manifest default", body = MutationResponse))
)]
pub async fn reset_key<S, G>(
    State(state): State<SettingsState<S, G>>,
    Path(key): Path<String>,
) -> Result<Json<MutationResponse>, StatusCode>
where
    S: SettingsStore,
    G: SettingsGate,
{
    let mut handlers = state.handlers.lock().expect("settings handlers lock");
    let data = handlers
        .reset_key(&state.principal, &key)
        .map_err(|e| status_for(&e))?;
    Ok(Json(MutationResponse {
        data,
        message: "Setting reset to default".to_string(),
    }))
}

#[utoipa::path(
    post,
    path = "/settings/reset",
    operation_id = "settings.reset",
    request_body = ResetRequest,
    responses((status = 200, description = "Reset declared keys to defaults (omit keys ⇒ reset all)", body = ResetResponse))
)]
pub async fn reset<S, G>(
    State(state): State<SettingsState<S, G>>,
    Json(body): Json<ResetRequest>,
) -> Result<Json<ResetResponse>, StatusCode>
where
    S: SettingsStore,
    G: SettingsGate,
{
    let mut handlers = state.handlers.lock().expect("settings handlers lock");
    let result = handlers
        .reset(&state.principal, body.keys.as_deref())
        .map_err(|e| status_for(&e))?;
    Ok(Json(ResetResponse {
        reset: result.reset,
        settings: result.settings,
    }))
}

#[utoipa::path(
    post,
    path = "/settings/{key}/ensure",
    operation_id = "settings.ensure",
    params(("key" = String, Path, description = "Declared setting key")),
    request_body = SettingValueBody,
    responses((status = 200, description = "Internal-only write-once seed (encryption seed / client id)", body = EnsureResponse))
)]
pub async fn ensure<S, G>(
    State(state): State<SettingsState<S, G>>,
    Path(key): Path<String>,
    Json(body): Json<SettingValueBody>,
) -> Result<Json<EnsureResponse>, StatusCode>
where
    S: SettingsStore,
    G: SettingsGate,
{
    let mut handlers = state.handlers.lock().expect("settings handlers lock");
    let data = handlers
        .ensure(&state.principal, &key, &body.value)
        .map_err(|e| status_for(&e))?;
    Ok(Json(EnsureResponse { data }))
}
