//! Shared HTTP response building blocks for the contacts API surface.
//!
//! The error envelope (`{ message, code? }`) and pagination meta shapes are
//! byte-identical to core's `ErrorBodySchema` / `PaginationMetaSchema` so a
//! consumer's generated client treats a contacts error exactly like a core
//! one.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;
use utoipa::ToSchema;

/// Error envelope returned by every fallible route. `code` carries the
/// originating error class name (e.g. `NotFoundError`) so clients can branch
/// without parsing `message`.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ErrorBody {
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}

/// A typed API error that renders to the shared `{ message, code }` envelope
/// with the right status code.
#[derive(Debug, Clone)]
pub struct ApiError {
    pub status: StatusCode,
    pub message: String,
    pub code: &'static str,
}

impl ApiError {
    pub fn not_found(resource: &str, id: &str) -> Self {
        ApiError {
            status: StatusCode::NOT_FOUND,
            message: format!("{resource} '{id}' not found"),
            code: "NotFoundError",
        }
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        ApiError {
            status: StatusCode::CONFLICT,
            message: message.into(),
            code: "ConflictError",
        }
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        ApiError {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
            code: "BadRequestError",
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        ApiError {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: message.into(),
            code: "InternalError",
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = ErrorBody {
            message: self.message,
            code: Some(self.code.to_string()),
        };
        (self.status, Json(body)).into_response()
    }
}

/// Pagination envelope returned by every list endpoint. Mirrors core's
/// `PaginationMetaSchema`.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PaginationMeta {
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
    pub has_more: bool,
}

impl PaginationMeta {
    /// Build the envelope for a `total`-row result set returned at `limit` /
    /// `offset`. `has_more` is true when rows remain past this page.
    pub fn new(total: i64, limit: i64, offset: i64) -> Self {
        PaginationMeta {
            total,
            limit,
            offset,
            has_more: offset + limit < total,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pagination_reports_more_when_rows_remain() {
        let meta = PaginationMeta::new(10, 2, 4);
        assert!(meta.has_more);
        let meta = PaginationMeta::new(10, 2, 8);
        assert!(!meta.has_more);
        let meta = PaginationMeta::new(10, 50, 0);
        assert!(!meta.has_more);
    }

    #[test]
    fn error_body_omits_absent_code() {
        let json = serde_json::to_string(&ErrorBody {
            message: "x".to_string(),
            code: None,
        })
        .unwrap();
        assert_eq!(json, r#"{"message":"x"}"#);
    }
}
