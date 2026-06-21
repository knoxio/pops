//! Router assembly + shared application state.

use axum::http::header::CONTENT_TYPE;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use sqlx::SqlitePool;

use crate::health::{health, root};
use crate::openapi::openapi_30_json;

/// State shared across handlers. `Clone` is cheap — the pool is an `Arc`
/// internally and the version is a small owned string.
#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub version: String,
}

/// `GET /openapi` — serve the pinned 3.0.3 OpenAPI document.
async fn openapi_document() -> impl IntoResponse {
    ([(CONTENT_TYPE, "application/json")], openapi_30_json())
}

/// Build the contacts router. Mounts the root banner, `/health`, `/openapi`,
/// the entities CRUD + bulk-lookup surface (N1), and the search slice (N1);
/// the registry lifecycle, URI resolve, and settings routers join in later
/// nodes.
pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/openapi", get(openapi_document))
        .merge(crate::entities::router())
        .merge(crate::search::router())
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    async fn test_state() -> AppState {
        let pool = db::connect("sqlite::memory:")
            .await
            .expect("in-memory pool for router tests");
        AppState {
            pool,
            version: "0.0.0-test".to_string(),
        }
    }

    #[tokio::test]
    async fn router_builds_without_panicking() {
        let _router = build_router(test_state().await);
    }

    #[tokio::test]
    async fn openapi_document_serves_30_json() {
        let body = openapi_30_json();
        assert!(body.contains("\"3.0.3\""));
    }
}
