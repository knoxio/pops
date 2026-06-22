//! `pops-ai` — the Rust mirror of the TS `@pops/ai-telemetry` package.
//!
//! It provides a 1:1 wire-compatible [`InferenceRecord`] (serde camelCase,
//! kebab-case status enum) for the cross-pillar `POST /ai-usage/record`
//! telemetry sink, plus the wrapping entrypoints ([`call_with_logging`],
//! [`call_with_logging_stream`]), cost math ([`compute_cost_usd`]), the
//! [`ReportSink`] trait + best-effort [`EnvHttpSink`], and the HTTP pricing
//! adapter ([`HttpLookupPricing`]).
//!
//! Parity with the TS schema is pinned by `tests/contract.rs`, which
//! round-trips a shared golden fixture (`tests/fixtures/record.json`) that the
//! TS `record-schema` test asserts is `InferenceRecordSchema.parse`-clean.
//!
//! This is a standalone library crate: it has no in-tree consumer yet (the
//! contacts Rust pillar will adopt it), so it ships compiled + tested-but-unused.

mod call;
mod cost;
mod pricing;
mod record;
mod sink;

pub use call::{call_with_logging, call_with_logging_stream, CallDeps, LoggingStream};
pub use cost::{compute_cost_usd, CostResult, PricingEntry};
pub use pricing::{HttpLookupPricing, LookupPricing};
pub use record::{CallResult, InferenceContext, InferenceRecord, InferenceStatus, Usage};
pub use sink::{EnvHttpSink, ReportSink};
