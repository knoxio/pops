//! Cross-language golden-fixture parity tests for `pops-ai`.
//!
//! `tests/fixtures/record.json` is the SHARED wire fixture: this test asserts
//! the Rust [`InferenceRecord`] round-trips it byte-for-byte, while the TS side
//! (`packages/ai-telemetry/src/__tests__/record-fixture.test.ts`) asserts the
//! SAME bytes are `InferenceRecordSchema.parse`-clean. Together they pin one
//! wire across both languages — any camelCase / kebab-case-enum drift fails here.

use std::sync::Arc;

use futures::stream::{self, StreamExt};
use pops_ai::{
    call_with_logging, call_with_logging_stream, compute_cost_usd, CallDeps, CallResult,
    EnvHttpSink, InferenceContext, InferenceRecord, InferenceStatus, LookupPricing, PricingEntry,
    ReportSink, Usage,
};

const FIXTURE: &str = include_str!("fixtures/record.json");

/// The golden fixture deserializes into an `InferenceRecord` and serializes
/// back to the EXACT same bytes — camelCase keys, kebab-case status, optionals
/// present. This is the cross-language wire pin.
#[test]
fn golden_fixture_round_trips_byte_for_byte() {
    let trimmed = FIXTURE.trim_end();
    let record: InferenceRecord = serde_json::from_str(trimmed).expect("fixture deserializes");

    assert_eq!(record.provider, "anthropic");
    assert_eq!(record.status, InferenceStatus::BudgetBlocked);
    assert!(record.cached);
    assert_eq!(record.context_id.as_deref(), Some("import_batch:42"));
    assert_eq!(record.prompt_version.as_deref(), Some("v3"));

    let reserialized = serde_json::to_string(&record).expect("record serializes");
    assert_eq!(
        reserialized, trimmed,
        "Rust serialization must match the shared TS-accepted fixture byte-for-byte"
    );
}

/// Every status value maps to the kebab-case string the TS `z.enum` accepts.
#[test]
fn status_enum_serializes_kebab_case() {
    let cases = [
        (InferenceStatus::Success, "\"success\""),
        (InferenceStatus::Error, "\"error\""),
        (InferenceStatus::Timeout, "\"timeout\""),
        (InferenceStatus::BudgetBlocked, "\"budget-blocked\""),
    ];
    for (status, expected) in cases {
        assert_eq!(serde_json::to_string(&status).unwrap(), expected);
        let back: InferenceStatus = serde_json::from_str(expected).unwrap();
        assert_eq!(back, status);
    }
}

/// Optional fields are OMITTED (not `null`) when `None`, matching zod
/// `.optional()` — a `null` would be rejected by the TS schema.
#[test]
fn absent_optionals_are_omitted_not_null() {
    let record = InferenceRecord {
        provider: "anthropic".into(),
        model: "claude-haiku-4-5".into(),
        operation: "categorize".into(),
        domain: "finance".into(),
        input_tokens: 10,
        output_tokens: 5,
        cost_usd: 0.001,
        latency_ms: 120,
        status: InferenceStatus::Success,
        cached: false,
        context_id: None,
        prompt_version: None,
        error_message: None,
        metadata: None,
    };
    let json = serde_json::to_string(&record).unwrap();
    assert!(
        !json.contains("contextId"),
        "absent contextId must be omitted: {json}"
    );
    assert!(
        !json.contains("null"),
        "no field should serialize to null: {json}"
    );
    assert!(json.contains("\"cached\":false"));
}

/// `compute_cost_usd` matches the TS arithmetic exactly.
#[test]
fn compute_cost_matches_ts_formula() {
    let pricing = PricingEntry {
        input: 1.0,
        output: 5.0,
    };
    let result = compute_cost_usd(1_000_000, 200_000, Some(&pricing));
    assert!((result.cost_usd - (1.0 + 1.0)).abs() < 1e-12);
    assert!(!result.missing);

    let missing = compute_cost_usd(10, 10, None);
    assert_eq!(missing.cost_usd, 0.0);
    assert!(missing.missing);
}

/// `EnvHttpSink` is a no-op when no base URL is configured — it never panics,
/// mirroring the TS browser/dev/vitest no-op.
#[tokio::test]
async fn env_http_sink_is_noop_without_base_url() {
    let sink = EnvHttpSink::new(None, None);
    assert!(!sink.is_active());
    // Must not panic even with no URL.
    sink.report(sample_record()).await;
}

#[tokio::test]
async fn env_http_sink_active_with_base_url() {
    let sink = EnvHttpSink::new(Some("http://ai-api:3008".into()), Some("tok".into()));
    assert!(sink.is_active());
}

/// A recording sink that captures every reported record for assertions.
#[derive(Default, Clone)]
struct RecordingSink {
    records: Arc<std::sync::Mutex<Vec<InferenceRecord>>>,
}

#[async_trait::async_trait]
impl ReportSink for RecordingSink {
    async fn report(&self, record: InferenceRecord) {
        self.records.lock().unwrap().push(record);
    }
}

struct FixedPricing(Option<PricingEntry>);

#[async_trait::async_trait]
impl LookupPricing for FixedPricing {
    async fn lookup(&self, _provider: &str, _model: &str) -> Option<PricingEntry> {
        self.0
    }
}

fn sample_record() -> InferenceRecord {
    serde_json::from_str(FIXTURE.trim_end()).unwrap()
}

fn ctx() -> InferenceContext {
    InferenceContext {
        provider: "anthropic".into(),
        model: "claude-haiku-4-5".into(),
        operation: "ego.chat".into(),
        domain: "cerebrum".into(),
        ..Default::default()
    }
}

/// `call_with_logging` returns the response and fires a success report with the
/// computed cost — off the hot path, never blocking the return.
#[tokio::test]
async fn call_with_logging_reports_success() {
    let sink = RecordingSink::default();
    let deps = CallDeps {
        sink: Arc::new(sink.clone()),
        lookup_pricing: Arc::new(FixedPricing(Some(PricingEntry {
            input: 3.0,
            output: 15.0,
        }))),
    };

    let response = call_with_logging(ctx(), deps, || async {
        Ok(CallResult {
            response: 42_u32,
            usage: Usage {
                input_tokens: 1_000_000,
                output_tokens: 1_000_000,
            },
        })
    })
    .await
    .expect("call succeeds");
    assert_eq!(response, 42);

    let record = await_one_record(&sink).await;
    assert_eq!(record.status, InferenceStatus::Success);
    assert_eq!(record.input_tokens, 1_000_000);
    assert!((record.cost_usd - 18.0).abs() < 1e-9);
}

/// On a failing call, an error report (tokens 0, status error) is fired BEFORE
/// the error propagates — telemetry is never lost even though the caller errors.
#[tokio::test]
async fn call_with_logging_reports_error_then_propagates() {
    let sink = RecordingSink::default();
    let deps = CallDeps {
        sink: Arc::new(sink.clone()),
        lookup_pricing: Arc::new(FixedPricing(None)),
    };

    let result: anyhow::Result<u32> = call_with_logging(ctx(), deps, || async {
        Err(anyhow::anyhow!("provider 529 overloaded"))
    })
    .await;
    assert!(result.is_err());

    let record = await_one_record(&sink).await;
    assert_eq!(record.status, InferenceStatus::Error);
    assert_eq!(record.input_tokens, 0);
    assert_eq!(
        record.error_message.as_deref(),
        Some("provider 529 overloaded")
    );
}

/// The streaming wrapper re-yields every item in order, then fires a success
/// report whose usage is extracted from the terminal event.
#[tokio::test]
async fn stream_passthrough_reports_terminal_usage() {
    let sink = RecordingSink::default();
    let deps = CallDeps {
        sink: Arc::new(sink.clone()),
        lookup_pricing: Arc::new(FixedPricing(Some(PricingEntry {
            input: 1.0,
            output: 1.0,
        }))),
    };

    let events = stream::iter(vec![
        StreamEvent::Delta("hel".into()),
        StreamEvent::Delta("lo".into()),
        StreamEvent::Done {
            tokens_in: 12,
            tokens_out: 8,
        },
    ]);

    let wrapped = call_with_logging_stream(ctx(), deps, events, |event| match event {
        StreamEvent::Done {
            tokens_in,
            tokens_out,
        } => Some(Usage {
            input_tokens: *tokens_in,
            output_tokens: *tokens_out,
        }),
        StreamEvent::Delta(_) => None,
    });

    let collected: Vec<StreamEvent> = wrapped.collect().await;
    assert_eq!(collected.len(), 3, "every event re-yielded in order");
    let deltas: Vec<&str> = collected
        .iter()
        .filter_map(|event| match event {
            StreamEvent::Delta(text) => Some(text.as_str()),
            StreamEvent::Done { .. } => None,
        })
        .collect();
    assert_eq!(
        deltas,
        ["hel", "lo"],
        "delta payloads re-yielded verbatim, in order"
    );
    assert!(matches!(collected[2], StreamEvent::Done { .. }));

    let record = await_one_record(&sink).await;
    assert_eq!(record.status, InferenceStatus::Success);
    assert_eq!(record.input_tokens, 12);
    assert_eq!(record.output_tokens, 8);
}

/// When no terminal usage event is seen, the stream still reports success with
/// tokens 0 (the TS "usage unavailable" path).
#[tokio::test]
async fn stream_without_usage_reports_zero() {
    let sink = RecordingSink::default();
    let deps = CallDeps {
        sink: Arc::new(sink.clone()),
        lookup_pricing: Arc::new(FixedPricing(None)),
    };

    let events = stream::iter(vec![StreamEvent::Delta("partial".into())]);
    let wrapped = call_with_logging_stream(ctx(), deps, events, |_event| None);
    let collected: Vec<StreamEvent> = wrapped.collect().await;
    assert_eq!(collected.len(), 1);

    let record = await_one_record(&sink).await;
    assert_eq!(record.status, InferenceStatus::Success);
    assert_eq!(record.input_tokens, 0);
    assert_eq!(record.output_tokens, 0);
}

#[derive(Debug, Clone)]
enum StreamEvent {
    Delta(String),
    Done { tokens_in: u32, tokens_out: u32 },
}

/// Polls the recording sink until the fire-and-forget `tokio::spawn` report has
/// landed. Yields to the runtime rather than sleeping a fixed duration.
async fn await_one_record(sink: &RecordingSink) -> InferenceRecord {
    for _ in 0..1000 {
        if let Some(record) = sink.records.lock().unwrap().first().cloned() {
            return record;
        }
        tokio::task::yield_now().await;
    }
    panic!("no record reported within the spawn budget");
}
