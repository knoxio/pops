//! Cross-pillar HTTP pricing lookup — the Rust mirror of TS `pricing-http.ts`.

use crate::cost::PricingEntry;

/// A pricing resolver: returns the per-Mtok pricing for a provider/model, or
/// `None` on any miss. Mirrors TS `LookupPricingFn`. Async, fallible-as-`None`
/// (never returns an error — telemetry must not break callers).
#[async_trait::async_trait]
pub trait LookupPricing: Send + Sync {
    async fn lookup(&self, provider: &str, model: &str) -> Option<PricingEntry>;
}

/// HTTP pricing adapter. Prefers the dedicated
/// `GET /ai-pricing/:provider/:model` route (already shaped as a
/// [`PricingEntry`]); falls back to `GET /ai-providers` and maps
/// `models[].{inputCostPerMtok,outputCostPerMtok}` → `{ input, output }` when
/// the dedicated route is absent (an older ai pillar). Returns `None` on any
/// miss and never errors — exactly like TS `httpLookupPricing`.
pub struct HttpLookupPricing {
    base: String,
    client: reqwest::Client,
}

impl HttpLookupPricing {
    /// Builds an adapter against an ai pillar base URL (a trailing slash is
    /// trimmed, mirroring the TS normalization).
    pub fn new(ai_api_base_url: impl Into<String>) -> Self {
        let raw = ai_api_base_url.into();
        let base = raw.strip_suffix('/').unwrap_or(&raw).to_string();
        Self {
            base,
            client: reqwest::Client::new(),
        }
    }

    async fn read_json(&self, url: &str) -> Option<serde_json::Value> {
        let response = self.client.get(url).send().await.ok()?;
        if !response.status().is_success() {
            return None;
        }
        response.json::<serde_json::Value>().await.ok()
    }

    async fn fetch_pricing_entry(&self, provider: &str, model: &str) -> Option<PricingEntry> {
        let url = format!(
            "{}/ai-pricing/{}/{}",
            self.base,
            encode_segment(provider),
            encode_segment(model)
        );
        let body = self.read_json(&url).await?;
        let input = as_number(body.get("input"))?;
        let output = as_number(body.get("output"))?;
        Some(PricingEntry { input, output })
    }

    async fn fetch_provider_fallback(&self, provider: &str, model: &str) -> Option<PricingEntry> {
        let url = format!("{}/ai-providers", self.base);
        let body = self.read_json(&url).await?;
        let providers = providers_array(&body);
        let provider_entry = providers
            .iter()
            .find(|entry| field_equals(entry, &["id", "provider"], provider))?;
        let models = to_array(provider_entry.get("models"));
        let model_entry = models
            .iter()
            .find(|entry| field_equals(entry, &["model", "id"], model))?;
        pricing_from_model(model_entry)
    }
}

#[async_trait::async_trait]
impl LookupPricing for HttpLookupPricing {
    async fn lookup(&self, provider: &str, model: &str) -> Option<PricingEntry> {
        if let Some(direct) = self.fetch_pricing_entry(provider, model).await {
            return Some(direct);
        }
        self.fetch_provider_fallback(provider, model).await
    }
}

fn encode_segment(segment: &str) -> String {
    // Mirrors JS encodeURIComponent for the characters that can appear in a
    // provider/model id. Path segments here are slugs (no whitespace), so a
    // conservative encode of the reserved path delimiters is sufficient.
    segment
        .chars()
        .flat_map(|c| match c {
            '/' => "%2F".chars().collect::<Vec<_>>(),
            '?' => "%3F".chars().collect(),
            '#' => "%23".chars().collect(),
            ' ' => "%20".chars().collect(),
            other => vec![other],
        })
        .collect()
}

fn as_number(value: Option<&serde_json::Value>) -> Option<f64> {
    let n = value?.as_f64()?;
    n.is_finite().then_some(n)
}

fn to_array(value: Option<&serde_json::Value>) -> Vec<serde_json::Value> {
    match value {
        Some(serde_json::Value::Array(items)) => items.clone(),
        _ => Vec::new(),
    }
}

fn providers_array(body: &serde_json::Value) -> Vec<serde_json::Value> {
    match body {
        serde_json::Value::Array(items) => items.clone(),
        other => to_array(other.get("providers")),
    }
}

fn field_equals(value: &serde_json::Value, keys: &[&str], expected: &str) -> bool {
    keys.iter()
        .any(|key| value.get(*key).and_then(serde_json::Value::as_str) == Some(expected))
}

fn pricing_from_model(model: &serde_json::Value) -> Option<PricingEntry> {
    let input = as_number(model.get("inputCostPerMtok"))?;
    let output = as_number(model.get("outputCostPerMtok"))?;
    Some(PricingEntry { input, output })
}
