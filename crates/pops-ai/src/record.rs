//! The canonical wire shape for a single AI inference event.
//!
//! This is the Rust mirror of `@pops/ai-telemetry`'s `InferenceRecordSchema`
//! (zod). The field casing (`serde(rename_all = "camelCase")`) and the status
//! enum (`serde(rename_all = "kebab-case")`) are load-bearing: they MUST
//! serialize to the exact JSON the TS `POST /ai-usage/record` ingest accepts.
//! The cross-language golden-fixture test (`tests/contract.rs`) pins this.

use serde::{Deserialize, Serialize};

/// Terminal status of a wrapped inference call. Serializes kebab-case to match
/// the TS `z.enum(['success','error','timeout','budget-blocked'])`.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum InferenceStatus {
    Success,
    Error,
    Timeout,
    BudgetBlocked,
}

/// One row per Claude call — the cross-pillar telemetry record.
///
/// PII discipline mirrors the TS schema: `context_id` is an opaque,
/// low-cardinality key and `metadata` is caller-supplied and must be PII-free.
/// Optional fields are omitted from the JSON when `None`
/// (`skip_serializing_if`) so the wire matches zod's `.optional()` exactly —
/// absent rather than `null`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InferenceRecord {
    pub provider: String,
    pub model: String,
    /// Free-form; each pillar owns its operation vocabulary.
    pub operation: String,
    /// The caller's pillar id (validated against KNOWN_MODULES server-side).
    pub domain: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cost_usd: f64,
    pub latency_ms: u32,
    pub status: InferenceStatus,
    /// Stored as 0|1 server-side.
    pub cached: bool,
    /// Opaque low-cardinality FK to the originating row; no whitespace.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub context_id: Option<String>,
    /// Merged into `metadata.prompt_version` server-side.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub prompt_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error_message: Option<String>,
    /// Caller-supplied, PII-free; the server caps the serialized JSON length.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub metadata: Option<serde_json::Value>,
}

/// Identity + provenance carried onto every emitted [`InferenceRecord`] — the
/// Rust mirror of TS `InferenceContext`. The measurement fields
/// (`status`/tokens/cost/latency/cached) are filled in by the wrapper; this
/// struct is what the caller supplies.
#[derive(Debug, Clone, Default)]
pub struct InferenceContext {
    pub provider: String,
    pub model: String,
    pub operation: String,
    pub domain: String,
    pub context_id: Option<String>,
    pub prompt_version: Option<String>,
    pub metadata: Option<serde_json::Value>,
    /// Reserved for the future pre-call budget gate (telemetry-only in v1):
    /// carried through but not enforced.
    pub cost_cap_usd: Option<f64>,
}

impl InferenceContext {
    /// Materializes a full [`InferenceRecord`] from this context plus the
    /// measured outcome. Mirrors the TS `buildBaseRecord` + spread on emit.
    pub fn into_record(
        &self,
        status: InferenceStatus,
        input_tokens: u32,
        output_tokens: u32,
        cost_usd: f64,
        latency_ms: u32,
        error_message: Option<String>,
    ) -> InferenceRecord {
        InferenceRecord {
            provider: self.provider.clone(),
            model: self.model.clone(),
            operation: self.operation.clone(),
            domain: self.domain.clone(),
            input_tokens,
            output_tokens,
            cost_usd,
            latency_ms,
            status,
            cached: false,
            context_id: self.context_id.clone(),
            prompt_version: self.prompt_version.clone(),
            error_message,
            metadata: self.metadata.clone(),
        }
    }
}

/// Token usage handed back by a wrapped non-streaming call, or extracted from a
/// stream's terminal event. Mirrors TS `CallResult.usage`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Usage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

/// What a wrapped non-streaming Claude call hands back — the response plus its
/// token usage. Mirrors TS `CallResult<T>`.
#[derive(Debug, Clone)]
pub struct CallResult<T> {
    pub response: T,
    pub usage: Usage,
}
