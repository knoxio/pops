# US-05: AI pillar extraction

> PRD: [055 — AI Inference & Monitoring](README.md)

Extract the AI-ops backend out of `core` into a standalone `ai` pillar (`@pops/ai-pillar`, container `ai-api`, port 3008, own `ai.db`). The pillar serves the same observability / providers / model-pricing / budgets / alerts surfaces core served, against its own database, and self-registers via the standard registry handshake. The AI usage dashboard (`@pops/app-ai`) moves with it and targets `ai-api`.

The `ai_usage` table and `ai-usage/cache.ts` (finance-categorizer state) deliberately do NOT move — they re-home to finance in a later stage and stay untouched in core for now.

## Acceptance criteria

- [x] `core` builds, typechecks, and tests green with zero references to the moved `ai_*` schema/services/modules/contracts/handlers; core's OpenAPI no longer exposes any `/ai-*` path.
- [x] `pillars/ai` is a TS pillar (`@pops/ai-pillar`, manifest `contract.package='@pops/ai'`, port 3008, `AI_SQLITE_PATH`) with a committed `openapi/ai.openapi.json`, a baseline migration, a hand-written Dockerfile whose builder stage builds, and `bootstrapPillar` self-registration.
- [x] Observability / providers / budgets / alerts REST surfaces respond identically from the new pillar; the moved test suites stay green under it.
- [x] The ai pillar serves its own `ai.*` settings (`@pops/pillar-settings`) from a `settings` table in `ai.db`.
- [x] The shell builds and the AI usage dashboard (`@pops/app-ai`, moved to `pillars/ai/app`) calls `ai-api` via the nginx `/ai-api/` upstream.
- [x] `ai` is a first-class pillar id (`PILLARS`, `PILLAR_UPSTREAMS`, `PILLAR_RENDER_ORDER`, `MODULE_PARENT_PILLAR`, module-registry discovery); the regenerated `nginx.conf` carries the `/ai-api/` block.
- [x] `ai-api` is wired into both compose files with a litestream config, healthcheck, and volume.

## Deliberately deferred (gap-tracked)

- `ai_usage` table + `ai-usage/cache.ts` re-home to finance — tracked, pending finance-plan ratification.
