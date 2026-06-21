//! `POST /search` — contacts' slice of unified search.

use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::api::ApiError;
use crate::app::AppState;
use crate::entities::model::decode_aliases;
use crate::entities::repo;

/// Cap on returned hits, matching core's `DEFAULT_LIMIT`.
const HIT_CAP: usize = 20;

/// `POST /search` request body. `query.text` is the term; `context` is
/// accepted and ignored (parity with the orchestrator's wire shape).
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct SearchRequest {
    pub query: SearchQuery,
    #[serde(default)]
    pub context: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct SearchQuery {
    pub text: String,
}

/// `POST /search` response body.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SearchResponse {
    pub hits: Vec<SearchHit>,
}

/// One ranked search hit. `uri` is the canonical `pops:contacts/contact/<id>`.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub uri: String,
    pub score: f64,
    pub match_field: String,
    pub match_type: MatchType,
    pub data: SearchHitData,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum MatchType {
    Exact,
    Prefix,
    Contains,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SearchHitData {
    pub name: String,
    pub r#type: String,
    pub aliases: Vec<String>,
}

/// Mount `POST /search`.
pub fn router() -> Router<AppState> {
    Router::new().route("/search", post(search))
}

#[utoipa::path(
    post,
    path = "/search",
    operation_id = "search.search",
    request_body = SearchRequest,
    responses((status = 200, description = "Ranked contact hits", body = SearchResponse))
)]
pub async fn search(
    State(state): State<AppState>,
    Json(request): Json<SearchRequest>,
) -> Result<Json<SearchResponse>, ApiError> {
    let text = request.query.text.trim().to_string();
    if text.is_empty() {
        return Ok(Json(SearchResponse { hits: Vec::new() }));
    }

    let candidates = repo::search_candidates(&state.pool, &text)
        .await
        .map_err(|err| ApiError::internal(err.to_string()))?;

    let mut hits: Vec<SearchHit> = candidates
        .into_iter()
        .filter_map(|row| {
            score_and_classify(&row.name, &text).map(|(score, match_type)| SearchHit {
                uri: format!("pops:contacts/contact/{}", row.id),
                score,
                match_field: "name".to_string(),
                match_type,
                data: SearchHitData {
                    name: row.name,
                    r#type: row.r#type,
                    aliases: decode_aliases(row.aliases.as_deref()),
                },
            })
        })
        .collect();

    hits.sort_by(|a, b| b.score.total_cmp(&a.score));
    hits.truncate(HIT_CAP);
    Ok(Json(SearchResponse { hits }))
}

/// Classify a candidate name against the query: exact 1.0 / prefix 0.8 /
/// contains 0.5, case-insensitive. `None` when the name does not contain the
/// query at all (the `LIKE` scan can over-match on collation edge cases).
fn score_and_classify(name: &str, query: &str) -> Option<(f64, MatchType)> {
    let lower = name.to_lowercase();
    let q = query.to_lowercase();
    if lower == q {
        Some((1.0, MatchType::Exact))
    } else if lower.starts_with(&q) {
        Some((0.8, MatchType::Prefix))
    } else if lower.contains(&q) {
        Some((0.5, MatchType::Contains))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scoring_ranks_exact_then_prefix_then_contains() {
        assert_eq!(
            score_and_classify("Acme", "acme"),
            Some((1.0, MatchType::Exact))
        );
        assert_eq!(
            score_and_classify("Acme Corp", "acme"),
            Some((0.8, MatchType::Prefix))
        );
        assert_eq!(
            score_and_classify("The Acme", "acme"),
            Some((0.5, MatchType::Contains))
        );
        assert_eq!(score_and_classify("Other", "acme"), None);
    }
}
