# Idea: per-call AI usage ledger in finance

> Source: split out of the Entity Matching Engine PRD — described as built, but no code writes the table.

## Problem

The `ai_usage` table exists in the finance schema (`description`, `entity_name`, `category`, input/output tokens, `cost_usd`, `cached`, `import_batch_id`, `created_at`) but nothing ever inserts into it. AI categorization cost/usage currently flows to the `ai` pillar via `@pops/ai-telemetry` and is summarized into the import result's per-batch `aiUsage` counters. There is no finance-local, per-call audit trail of which description cost what.

## Build later

If finance needs its own queryable cost ledger (independent of the ai pillar):

- Insert one `ai_usage` row per categorizer call from the import flow: description (or a sanitized key), suggested entity, tokens, cost, `cached` flag, and `import_batch_id`.
- Record cache hits with `cached = 1` and zero tokens/cost (depends on the result-cache idea landing first).
- Expose a read endpoint for per-batch / per-day cost rollups, backed by the existing `idx_ai_usage_batch` and `idx_ai_usage_created_at` indexes.

## Notes

Reconsider whether this duplicates the `ai` pillar's telemetry store before building. If the ai-pillar analytics already answer the cost questions, this table should likely be dropped rather than populated. Decide one way or the other — a schema with no writer is worse than either.
