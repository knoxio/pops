# US-06: Inference ingest + pricing read

> PRD: [055 — AI Inference & Monitoring](README.md)

Add the cross-pillar telemetry sink `POST /ai-usage/record` on the ai pillar — the first production write path into `ai_inference_log`. Every pillar that calls Claude reports usage/cost/latency/cache/error through it via the `@pops/ai-telemetry` wrapper. Add the companion pricing read `GET /ai-pricing/:provider/:model → {input,output}` so callers fetch pricing already shaped before computing cost.

## Acceptance criteria

- [x] `POST /ai-usage/record` is internal-only: an `INTERNAL_PATHS` gate 403s any request without a matching `x-pops-internal-token`; nginx does not proxy it.
- [x] The body is the shared `InferenceRecordSchema` (`@pops/ai-telemetry/record-schema`) — single source of truth, so the wrapper and ingest cannot drift.
- [x] A valid record writes exactly one `ai_inference_log` row with the field mapping applied (`cached`→0|1, `promptVersion`→`metadata.prompt_version`, `contextId`→`context_id`); the handler does ONLY `createInferenceLog` and NEVER touches `ai_inference_daily`.
- [x] The handler is best-effort: it caps `metadata` JSON length, always returns `200 {ok:true}` on a valid body even if the insert throws, and 400s a malformed/unknown domain or a schema-invalid body without writing.
- [x] `GET /ai-pricing/:provider/:model` is public-readable (NOT internal) and returns `{input,output}` per-Mtok USD, backed by the moved pricing cache (default price on miss, never 404s).
- [x] Vitest covers the gate (403), the happy path (one row, daily untouched), validation (400), the metadata cap, and the pricing read — against real in-memory SQLite.

## Out of scope (later stage)

- Migrating the 11 direct-Anthropic callers (finance/cerebrum/food) onto the wrapper, the food sink reconciliation, and the Rust `crates/pops-ai` crate — those land after this extraction.
