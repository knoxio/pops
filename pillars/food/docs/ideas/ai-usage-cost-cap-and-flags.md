# Idea: AI usage cost-cap observation + telemetry metadata flags

Forward-looking extensions to the food AI usage logging (see prds/ai-usage-prompts). Neither is built today.

## Cost-cap observation

Flag (and eventually abort) Claude calls that blow a per-job cost budget.

- Env `FOOD_INGEST_COST_CAP_PER_JOB_USD` (default `0.05`), exposed in the worker compose.
- When a single call's computed `costUsd` exceeds the cap, stamp `metadata.over_cost_cap = true` on the reported record and emit a console warning. Observation only — do **not** abort the call.
- Per-job (sum-across-calls) cap: most ingests make one LLM call so per-call ≈ per-job; the Instagram vision + text-fallback path is the only multi-call case and would evaluate the cap per row.
- Future hard mode: abort with a `CostCapExceeded` error once a cap is exceeded.

Today there is zero `cost_cap` / `over_cost_cap` / `CostCapExceeded` reference anywhere in the food pillar.

## Explicit metadata flags on the inference record

`computeCostUsd` already returns an internal `missing: true` on a pricing miss, but nothing stamps it onto the reported `InferenceRecord`. Surface diagnostic flags so the ai pillar's monthly review can filter on them:

- `metadata.cost_missing = true` when pricing lookup misses (cost reported as 0).
- `metadata.usage_missing = true` when Anthropic returns success but no usage data (tokens 0).

Both require threading a `metadata` object through `callWithLogging` (or stamping it in food's deps wrapper). The `InferenceRecord` schema already carries an optional `metadata` field and `promptVersion`; only the flag-setting is missing.
