//! The fire-and-forget report sink — the Rust mirror of TS
//! `report-sink.ts` (`createEnvReportSink` / `reportInference`).

use async_trait::async_trait;

use crate::record::InferenceRecord;

/// Path the record is POSTed to on the ai pillar. Matches TS `RECORD_PATH`.
const RECORD_PATH: &str = "/ai-usage/record";

/// A fire-and-forget sink for a finished inference record. By contract it must
/// never panic and never propagate an error into the caller — telemetry can
/// never break a Claude call. Mirrors TS `ReportInferenceFn`.
#[async_trait]
pub trait ReportSink: Send + Sync {
    async fn report(&self, record: InferenceRecord);
}

/// Reads an environment variable, treating an empty string as unset (mirrors
/// the JS `process.env.X ?? undefined` falsy-empty behavior closely enough for
/// the URL/token resolution).
fn env_nonempty(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|value| !value.is_empty())
}

/// An env-driven sink that POSTs an [`InferenceRecord`] to the ai pillar's
/// internal `/ai-usage/record` ingest.
///
/// Resolution mirrors TS exactly: the base URL is `AI_API_URL` FIRST (so it
/// never collides with a service's self-pointing `POPS_API_URL`), then
/// `POPS_API_URL`; the token is `POPS_API_INTERNAL_TOKEN`. When no base URL
/// resolves, [`report`](ReportSink::report) is a silent no-op. A non-2xx
/// response or a transport failure is swallowed — best-effort by contract.
pub struct EnvHttpSink {
    base_url: Option<String>,
    token: Option<String>,
    client: reqwest::Client,
}

impl EnvHttpSink {
    /// Builds a sink from the ambient environment. Never fails: a missing URL
    /// simply yields a no-op sink.
    pub fn from_env() -> Self {
        Self {
            base_url: env_nonempty("AI_API_URL").or_else(|| env_nonempty("POPS_API_URL")),
            token: env_nonempty("POPS_API_INTERNAL_TOKEN"),
            client: reqwest::Client::new(),
        }
    }

    /// Builds a sink with explicit configuration (for tests / non-env wiring).
    /// A `None` base URL yields a no-op sink, matching `from_env`.
    pub fn new(base_url: Option<String>, token: Option<String>) -> Self {
        Self {
            base_url,
            token,
            client: reqwest::Client::new(),
        }
    }

    /// Whether this sink will actually attempt a POST. `false` for the no-op
    /// (no base URL) case — useful for tests asserting the dev/browser no-op.
    pub fn is_active(&self) -> bool {
        self.base_url.is_some()
    }
}

#[async_trait]
impl ReportSink for EnvHttpSink {
    async fn report(&self, record: InferenceRecord) {
        let Some(base_url) = &self.base_url else {
            return;
        };
        let base = base_url.strip_suffix('/').unwrap_or(base_url);
        let mut request = self
            .client
            .post(format!("{base}{RECORD_PATH}"))
            .json(&record);
        if let Some(token) = &self.token {
            request = request.header("x-pops-internal-token", token);
        }
        // Best-effort by contract: drop any transport error on the floor so a
        // failing sink can never propagate into (or panic) a caller.
        let _ = request.send().await;
    }
}
