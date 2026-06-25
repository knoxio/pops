# PRD: AI Inference & Monitoring

> Status: Partial — the standalone pillar and cross-pillar telemetry ingest are built; the proactive anomaly/summary/Moltbot layer is not (see [ideas](../ideas/proactive-ai-monitoring.md)).

## Purpose

Make AI telemetry real. The AI Ops backend is its own pillar with its own `ai.db`, and there is one production write path into `ai_inference_log`: an internal ingest that every model-calling pillar posts to via the `@pops/ai-telemetry` wrapper. Callers fetch shaped pricing from a public pricing read before computing cost.

## REST API Surface

| Method | Path                           | Auth          | Body / Returns                                                    |
| ------ | ------------------------------ | ------------- | ----------------------------------------------------------------- |
| POST   | `/ai-usage/record`             | internal-only | Body = the shared `InferenceRecordSchema`; returns `{ ok: true }` |
| GET    | `/ai-pricing/:provider/:model` | public        | `{ input, output }` — per-million-token USD pair                  |

### Ingest (`POST /ai-usage/record`)

- **Internal-only.** An `INTERNAL_PATHS` gate 403s any request lacking a matching `x-pops-internal-token`; nginx never proxies this path. The only reachable callers are sibling pillars carrying the shared token.
- The body is the single-source-of-truth `InferenceRecordSchema` from `@pops/ai-telemetry/record-schema`, so the wrapper and the ingest cannot drift.
- A valid record writes **exactly one** `ai_inference_log` row (`cached → 0|1`, `promptVersion → metadata.prompt_version`, `contextId → context_id`). The handler only calls `createInferenceLog`; it never touches `ai_inference_daily`.
- **Best-effort:** it caps `metadata` JSON length, returns `200 { ok: true }` on a valid body even if the insert throws, and 400s a malformed/unknown-domain or schema-invalid body without writing.

### Pricing read (`GET /ai-pricing/:provider/:model`)

- Public-readable (not internal) — the telemetry wrapper fetches it before `computeCostUsd`.
- Returns `{ input, output }` per-Mtok USD, backed by the in-process pricing cache. On a cache/DB miss it returns a default price (`{ input: 1.0, output: 5.0 }`); it never 404s.

## Rules

- Telemetry is the only producer of `ai_inference_log` rows. No pillar inserts into the table directly; they all go through the wrapper → ingest.
- The pillar boots its own `ai.db`, serves the full AI-ops contract, and self-registers with the `registry` pillar via the standard `bootstrapPillar` handshake when `POPS_REGISTRY_ENABLED=true`.

## Acceptance Criteria

- [x] The AI Ops backend runs as an independent pillar (`@pops/ai`, container `pops-ai`, port 3008) with its own `ai.db`, a committed `openapi/ai.openapi.json`, a baseline migration, a Dockerfile, and registry self-registration.
- [x] Observability, providers, budgets, and alerts REST surfaces respond from this pillar against `ai.db`.
- [x] The AI usage dashboard (`@pops/app-ai`, at `pillars/ai/app`) targets the pillar through the shell's `/ai-api/` upstream.
- [x] `POST /ai-usage/record` 403s without a matching internal token and is not proxied by nginx.
- [x] A valid record writes exactly one `ai_inference_log` row with the field mapping applied; the handler never touches `ai_inference_daily`.
- [x] The ingest is best-effort: caps `metadata` length, always 200s on a valid body even if the insert throws, and 400s a malformed/unknown-domain body without writing.
- [x] `GET /ai-pricing/:provider/:model` is public, returns `{ input, output }` per-Mtok USD, falls back to a default on miss, and never 404s.

## Not Built (tracked as an idea)

The proactive monitoring layer — spending-anomaly detection, scheduled weekly/monthly summaries, Telegram delivery via Moltbot, and configurable anomaly thresholds — is **not implemented**. It is captured in [ideas/proactive-ai-monitoring.md](../ideas/proactive-ai-monitoring.md), not as a requirement here.

## Out of Scope

- The interactive assistant (Cerebrum/Ego); model training; real-time streaming analysis.
- Migrating every direct-Anthropic caller onto the wrapper (an ongoing rollout, not part of this pillar's contract).
