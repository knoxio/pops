//! Pricing entry + cost computation — the Rust mirror of TS `computeCostUsd`.

use serde::{Deserialize, Serialize};

/// Per-million-token USD pricing for a given provider/model. Mirrors the TS
/// `PricingEntry` (`{ input, output }`) and the `GET /ai-pricing/:p/:m` body.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
pub struct PricingEntry {
    pub input: f64,
    pub output: f64,
}

/// The outcome of [`compute_cost_usd`]: the USD cost and whether pricing was
/// missing. `missing: true` (with `cost_usd: 0.0`) lets a caller distinguish
/// "free" from "unpriced", exactly as the TS function does.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CostResult {
    pub cost_usd: f64,
    pub missing: bool,
}

/// Computes the USD cost of a call from per-million-token pricing.
///
/// Byte-for-byte the same arithmetic as TS:
/// `(input/1e6)*p.input + (output/1e6)*p.output`. Returns `missing: true`
/// (and `cost_usd: 0.0`) when pricing is `None`.
pub fn compute_cost_usd(
    input_tokens: u32,
    output_tokens: u32,
    pricing: Option<&PricingEntry>,
) -> CostResult {
    match pricing {
        None => CostResult {
            cost_usd: 0.0,
            missing: true,
        },
        Some(p) => {
            let cost_usd = (input_tokens as f64 / 1_000_000.0) * p.input
                + (output_tokens as f64 / 1_000_000.0) * p.output;
            CostResult {
                cost_usd,
                missing: false,
            }
        }
    }
}
