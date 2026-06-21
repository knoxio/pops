//! The wrapping entrypoints — Rust mirrors of TS `callWithLogging` and
//! `callWithLoggingStream`. Both measure latency, resolve pricing, and report
//! the inference record fire-and-forget (off the hot path). Telemetry never
//! alters control flow: a slow or failing sink never delays or fails the call.

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::Instant;

use futures::stream::Stream;

use crate::cost::compute_cost_usd;
use crate::pricing::LookupPricing;
use crate::record::{CallResult, InferenceContext, InferenceStatus, Usage};
use crate::sink::ReportSink;

/// Dependencies shared by both entrypoints — the injected sink and pricing
/// resolver. Mirrors the TS `CallWithLoggingDeps` (`report` + `lookupPricing`).
#[derive(Clone)]
pub struct CallDeps {
    pub sink: Arc<dyn ReportSink>,
    pub lookup_pricing: Arc<dyn LookupPricing>,
}

/// Schedules a success report off the hot path: resolves pricing, computes
/// cost, and fires the record. A pricing miss yields `cost_usd: 0.0`, matching
/// the record the TS wrapper emits.
fn spawn_success_report(deps: CallDeps, ctx: InferenceContext, usage: Usage, latency_ms: u32) {
    tokio::spawn(async move {
        let pricing = deps.lookup_pricing.lookup(&ctx.provider, &ctx.model).await;
        let cost = compute_cost_usd(usage.input_tokens, usage.output_tokens, pricing.as_ref());
        let record = ctx.into_record(
            InferenceStatus::Success,
            usage.input_tokens,
            usage.output_tokens,
            cost.cost_usd,
            latency_ms,
            None,
        );
        deps.sink.report(record).await;
    });
}

/// Fires an error report (tokens 0, status error) off the hot path. Mirrors
/// the TS error branch, which schedules the report BEFORE rethrowing.
fn spawn_error_report(
    deps: CallDeps,
    ctx: InferenceContext,
    latency_ms: u32,
    error_message: String,
) {
    tokio::spawn(async move {
        let record = ctx.into_record(
            InferenceStatus::Error,
            0,
            0,
            0.0,
            latency_ms,
            Some(error_message),
        );
        deps.sink.report(record).await;
    });
}

fn elapsed_ms(start: Instant) -> u32 {
    start.elapsed().as_millis().min(u128::from(u32::MAX)) as u32
}

/// Caps an error message to 1000 chars on a char boundary (mirrors the TS
/// `String(err).slice(0, 1000)` length guard).
fn cap_error(message: &str) -> String {
    message.chars().take(1000).collect()
}

/// Wraps a non-streaming Claude call. Returns the response on the hot path
/// unchanged; then, fire-and-forget, looks up pricing, computes cost, and
/// reports a `success` record. On error it reports a `status: 'error'` record
/// (tokens 0) BEFORE returning the error. Mirrors TS `callWithLogging`.
///
/// `call` returns `anyhow::Result<CallResult<T>>` so any error type funnels
/// through; the error's `Display` becomes `error_message` (capped to 1000
/// chars, matching the TS wire discipline).
pub async fn call_with_logging<T, F, Fut>(
    ctx: InferenceContext,
    deps: CallDeps,
    call: F,
) -> anyhow::Result<T>
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = anyhow::Result<CallResult<T>>>,
{
    let start = Instant::now();
    match call().await {
        Ok(CallResult { response, usage }) => {
            spawn_success_report(deps, ctx, usage, elapsed_ms(start));
            Ok(response)
        }
        Err(error) => {
            spawn_error_report(deps, ctx, elapsed_ms(start), cap_error(&error.to_string()));
            Err(error)
        }
    }
}

/// Wraps a Claude stream: re-yields every item verbatim with zero added
/// latency. After the stream drains it resolves usage from the items seen,
/// looks up pricing, and reports a `success` record off the hot path. Mirrors
/// TS `callWithLoggingStream`.
///
/// `extract_usage` is applied to every item (mirroring the TS streaming
/// callers, whose extractor returns `Some` only on the terminal `done` event):
/// the most recent `Some` is what gets reported, and `None` everywhere records
/// a `success` row with tokens 0 (the "usage unavailable" path). This avoids
/// requiring `E: Clone` to retain the terminal event.
pub fn call_with_logging_stream<E, S, X>(
    ctx: InferenceContext,
    deps: CallDeps,
    stream: S,
    extract_usage: X,
) -> LoggingStream<E, S, X>
where
    S: Stream<Item = E>,
    X: Fn(&E) -> Option<Usage>,
{
    LoggingStream {
        inner: Box::pin(stream),
        extract_usage,
        usage: None,
        start: Instant::now(),
        state: Some((ctx, deps)),
    }
}

/// The stream adapter returned by [`call_with_logging_stream`]. Passes each
/// item through untouched; on stream end it fires the success report.
///
/// The inner stream is boxed-and-pinned so the adapter is `Unpin` and needs no
/// `unsafe` pin projection — every remaining field is a plain owned value.
pub struct LoggingStream<E, S, X>
where
    S: Stream<Item = E>,
    X: Fn(&E) -> Option<Usage>,
{
    inner: Pin<Box<S>>,
    extract_usage: X,
    usage: Option<Usage>,
    start: Instant,
    state: Option<(InferenceContext, CallDeps)>,
}

// Sound: the only pin-sensitive field, `inner`, is already a `Pin<Box<S>>`
// (always `Unpin`); every other field is a plain owned value. Asserting `Unpin`
// unconditionally lets `poll_next` use safe `get_mut` without constraining `X`.
impl<E, S, X> Unpin for LoggingStream<E, S, X>
where
    S: Stream<Item = E>,
    X: Fn(&E) -> Option<Usage>,
{
}

impl<E, S, X> Stream for LoggingStream<E, S, X>
where
    S: Stream<Item = E>,
    X: Fn(&E) -> Option<Usage>,
{
    type Item = E;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<E>> {
        let this = self.get_mut();
        match this.inner.as_mut().poll_next(cx) {
            Poll::Ready(Some(item)) => {
                if let Some(usage) = (this.extract_usage)(&item) {
                    this.usage = Some(usage);
                }
                Poll::Ready(Some(item))
            }
            Poll::Ready(None) => {
                if let Some((ctx, deps)) = this.state.take() {
                    let usage = this.usage.unwrap_or(Usage {
                        input_tokens: 0,
                        output_tokens: 0,
                    });
                    spawn_success_report(deps, ctx, usage, elapsed_ms(this.start));
                }
                Poll::Ready(None)
            }
            Poll::Pending => Poll::Pending,
        }
    }
}
