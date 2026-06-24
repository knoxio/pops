# Idea: Per-source ingest cost on the Rejected tab

The Rejected-tab `RejectedRow` carries an `ingestCostUsd` field, but it is always `null`. Food's local `ai_inference_log` table was dropped when AI telemetry moved to the `ai` pillar (`@pops/ai-telemetry`); the food DB no longer tracks per-source LLM spend, so `listRejected` hard-codes the column to `NULL` and the UI suppresses the cost line.

## Build later

Restore a visible "this ingest cost $X" figure on rejected (and probably failed/draft) rows by sourcing it from the `ai` pillar instead of the food DB:

- Tag each ingest's AI calls with a stable correlation id (e.g. `ingest_source:<id>`) when the food worker invokes the `ai` pillar.
- Add an `ai`-pillar endpoint that aggregates spend for a set of correlation ids: `POST /usage/by-context { contextIds: string[] } → { [contextId]: { usd } }`.
- Have `listRejected` (and the failed/drafts queries, if wanted) call the `ai` pillar via `@pops/pillar-sdk` for the page's source ids and fill `ingestCostUsd`, or have the food worker persist a denormalised `ingest_cost_usd` snapshot on `ingest_sources` at completion time so the read stays single-pillar.

Prefer the denormalised snapshot if cross-pillar latency on the list endpoint is a concern; prefer the live aggregate if cost can change after the fact (re-pricing, retries).

## Why deferred

Cosmetic. The tabs work without it; cost is informational. Pulling it back requires either a new cross-pillar read on a hot list endpoint or a worker-side schema add — neither is justified until someone actually wants spend visibility in triage.
