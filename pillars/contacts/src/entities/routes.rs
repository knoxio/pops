//! Axum routes for the entities (contact) CRUD surface + bulk lookup.
//!
//! Every `#[utoipa::path]` pins `operation_id` to the DOTTED `<router>.<proc>`
//! string (`entities.list`, `entities.create`, …). This is load-bearing: the
//! SDK route map keys on the dotted operationId and hey-api derives the
//! camelCase client method names from it, so a derived (Rust fn name) id would
//! silently break every consumer. utoipa's default id is the fn name and
//! cannot contain a dot, hence the explicit override on each route.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use super::model::{CreateEntityBody, Entity, EntityLookup, UpdateEntityBody, ENTITY_TYPES};
use super::repo;
use crate::api::{ApiError, PaginationMeta};
use crate::app::AppState;
use crate::time::now_rfc3339;

/// Default page size when `limit` is omitted, matching the core entities list.
const DEFAULT_LIMIT: i64 = 50;
/// Hard cap on `limit` so a caller cannot request an unbounded page.
const MAX_LIMIT: i64 = 200;

/// Query params for `GET /entities`.
#[derive(Debug, Clone, Deserialize, IntoParams)]
#[serde(rename_all = "camelCase")]
pub struct ListQuery {
    pub search: Option<String>,
    #[param(rename = "type")]
    pub r#type: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// `GET /entities` response body.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct EntityListResponse {
    pub data: Vec<Entity>,
    pub pagination: PaginationMeta,
}

/// `GET /entities/:id` response body.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct EntityResponse {
    pub data: Entity,
}

/// Create/update response body — the entity plus a human-readable message.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct EntityMutation {
    pub data: Entity,
    pub message: String,
}

/// Bare `{ message }` body returned by delete.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MessageResponse {
    pub message: String,
}

/// `POST /entities/lookup` body — reserved for a future field selector; an
/// empty body fetches the default match columns.
#[derive(Debug, Clone, Default, Deserialize, ToSchema)]
pub struct LookupBody {
    #[serde(default)]
    pub fields: Option<Vec<String>>,
}

/// `POST /entities/lookup` response — the whole contact set's match columns in
/// one round-trip, plus the fetch instant for the caller's in-run cache.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LookupResponse {
    pub entities: Vec<EntityLookup>,
    pub fetched_at: String,
}

/// Mount the entities routes onto a router sharing [`AppState`].
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/entities", get(list).post(create))
        .route(
            "/entities/:id",
            get(get_one).patch(update).delete(delete_one),
        )
        .route("/entities/lookup", post(lookup))
}

#[utoipa::path(
    get,
    path = "/entities",
    operation_id = "entities.list",
    params(ListQuery),
    responses((status = 200, description = "Paginated entity list", body = EntityListResponse))
)]
pub async fn list(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> Result<Json<EntityListResponse>, ApiError> {
    if let Some(ty) = query.r#type.as_deref() {
        validate_type(ty)?;
    }
    let limit = query.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let offset = query.offset.unwrap_or(0).max(0);

    let (rows, total) = repo::list(
        &state.pool,
        query.search.as_deref(),
        query.r#type.as_deref(),
        limit,
        offset,
    )
    .await
    .map_err(db_error)?;

    Ok(Json(EntityListResponse {
        data: rows.into_iter().map(Entity::from).collect(),
        pagination: PaginationMeta::new(total, limit, offset),
    }))
}

#[utoipa::path(
    get,
    path = "/entities/{id}",
    operation_id = "entities.get",
    params(("id" = String, Path, description = "Entity id")),
    responses(
        (status = 200, description = "The entity", body = EntityResponse),
        (status = 404, description = "No such entity", body = crate::api::ErrorBody)
    )
)]
pub async fn get_one(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<EntityResponse>, ApiError> {
    let row = repo::get(&state.pool, &id)
        .await
        .map_err(db_error)?
        .ok_or_else(|| ApiError::not_found("Entity", &id))?;
    Ok(Json(EntityResponse { data: row.into() }))
}

#[utoipa::path(
    post,
    path = "/entities",
    operation_id = "entities.create",
    request_body = CreateEntityBody,
    responses(
        (status = 201, description = "Created entity", body = EntityMutation),
        (status = 400, description = "Invalid body", body = crate::api::ErrorBody),
        (status = 409, description = "Duplicate name", body = crate::api::ErrorBody)
    )
)]
pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateEntityBody>,
) -> Result<(StatusCode, Json<EntityMutation>), ApiError> {
    if body.name.trim().is_empty() {
        return Err(ApiError::bad_request("Name is required"));
    }
    if let Some(ty) = body.r#type.as_deref() {
        validate_type(ty)?;
    }

    let row = repo::create(&state.pool, body).await.map_err(repo_error)?;
    Ok((
        StatusCode::CREATED,
        Json(EntityMutation {
            data: row.into(),
            message: "Entity created".to_string(),
        }),
    ))
}

#[utoipa::path(
    patch,
    path = "/entities/{id}",
    operation_id = "entities.update",
    params(("id" = String, Path, description = "Entity id")),
    request_body = UpdateEntityBody,
    responses(
        (status = 200, description = "Updated entity", body = EntityMutation),
        (status = 404, description = "No such entity", body = crate::api::ErrorBody),
        (status = 409, description = "Duplicate name", body = crate::api::ErrorBody)
    )
)]
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(patch): Json<UpdateEntityBody>,
) -> Result<Json<EntityMutation>, ApiError> {
    if let Some(name) = patch.name.as_deref() {
        if name.trim().is_empty() {
            return Err(ApiError::bad_request("Name cannot be empty"));
        }
    }
    if let Some(ty) = patch.r#type.as_deref() {
        validate_type(ty)?;
    }

    let row = repo::update(&state.pool, &id, patch)
        .await
        .map_err(|err| repo_not_found(err, &id))?;
    Ok(Json(EntityMutation {
        data: row.into(),
        message: "Entity updated".to_string(),
    }))
}

#[utoipa::path(
    delete,
    path = "/entities/{id}",
    operation_id = "entities.delete",
    params(("id" = String, Path, description = "Entity id")),
    responses(
        (status = 200, description = "Deleted", body = MessageResponse),
        (status = 404, description = "No such entity", body = crate::api::ErrorBody)
    )
)]
pub async fn delete_one(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<MessageResponse>, ApiError> {
    let removed = repo::delete(&state.pool, &id).await.map_err(db_error)?;
    if !removed {
        return Err(ApiError::not_found("Entity", &id));
    }
    Ok(Json(MessageResponse {
        message: "Entity deleted".to_string(),
    }))
}

#[utoipa::path(
    post,
    path = "/entities/lookup",
    operation_id = "entities.lookup",
    request_body = LookupBody,
    responses((status = 200, description = "Bulk match columns", body = LookupResponse))
)]
pub async fn lookup(
    State(state): State<AppState>,
    body: Option<Json<LookupBody>>,
) -> Result<Json<LookupResponse>, ApiError> {
    let _ = body;
    let rows = repo::lookup_bulk(&state.pool).await.map_err(db_error)?;
    Ok(Json(LookupResponse {
        entities: rows.into_iter().map(EntityLookup::from).collect(),
        fetched_at: now_rfc3339(),
    }))
}

/// Reject a `type` value outside the accepted entity discriminator set with a
/// 400, listing the legal values.
fn validate_type(ty: &str) -> Result<(), ApiError> {
    if ENTITY_TYPES.contains(&ty) {
        Ok(())
    } else {
        Err(ApiError::bad_request(format!(
            "Invalid type '{ty}'. Expected one of: {}",
            ENTITY_TYPES.join(", ")
        )))
    }
}

fn db_error(err: sqlx::Error) -> ApiError {
    ApiError::internal(err.to_string())
}

fn repo_error(err: repo::RepoError) -> ApiError {
    match err {
        repo::RepoError::Conflict(message) => ApiError::conflict(message),
        repo::RepoError::NotFound => ApiError::not_found("Entity", "unknown"),
        repo::RepoError::Db(e) => db_error(e),
    }
}

fn repo_not_found(err: repo::RepoError, id: &str) -> ApiError {
    match err {
        repo::RepoError::NotFound => ApiError::not_found("Entity", id),
        other => repo_error(other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_type() {
        assert!(validate_type("wizard").is_err());
        assert!(validate_type("person").is_ok());
    }
}
