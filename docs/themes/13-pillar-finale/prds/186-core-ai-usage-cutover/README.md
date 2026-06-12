# PRD-186: core.aiUsage cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move `ai_usage_log`, `ai_budgets`, and `ai_usage_cache` tables + `core.aiUsage.*` procedures into `core.db`. Follows the canonical N-track pattern from [PRD-165](../165-media-movies-cutover/README.md).

AI usage is the cross-pillar accounting surface — every AI Ops call (categorisation, generation, transcription) logs here. Budgets are enforced before AI calls; the cache deduplicates identical prompts. Read-write heavy; small but hot.

## Data Model

Tables (move from shared to `packages/core-db`):

- `ai_usage_log` — { id, called_at, model, provider, prompt_tokens, response_tokens, cost_usd, surface, request_hash }
- `ai_budgets` — { id, name, limit_usd, period ('day' | 'week' | 'month'), active }
- `ai_usage_cache` — { request_hash, response_text, cached_at, hits }

## API Surface

| Procedure                             | Kind                                     |
| ------------------------------------- | ---------------------------------------- |
| `core.aiUsage.log.create`             | mutation (called by AI Ops orchestrator) |
| `core.aiUsage.log.list`               | query                                    |
| `core.aiUsage.budgets.list`           | query                                    |
| `core.aiUsage.budgets.create`         | mutation                                 |
| `core.aiUsage.budgets.checkAvailable` | query (gates AI calls)                   |
| `core.aiUsage.cache.lookup`           | query                                    |
| `core.aiUsage.cache.store`            | mutation                                 |

Files today: `apps/pops-api/src/modules/core/ai-usage/{router.ts, service.ts, cache.ts, types.ts}`.

## Business Rules

Follows [PRD-165's 4-PR sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- `checkAvailable` is called before every AI request; the cutover must preserve sub-millisecond response (it's on the hot path).
- The cache is reconstructible (hash-keyed); aggressive cache eviction during cutover doesn't break correctness — only perf.
- AI Ops orchestrator (Epic 08b) will eventually call `core.aiUsage` via the SDK; for now it imports `@pops/core-db` directly. The cutover moves data; the orchestrator location decision (Epic 08b ADR-029) is separate.

## Edge Cases

| Case                                           | Behaviour                                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Budget check during cutover deploy             | Active handle prevails; brief window where budget snapshot may be stale by milliseconds. Acceptable.        |
| Cache miss explosion post-cutover (cold cache) | First boot post-cutover sees more cache misses while backfill runs. AI Ops cost spikes briefly. Acceptable. |
| Concurrent log inserts                         | Existing UPSERT semantics preserved.                                                                        |

## User Stories

| #   | Story                                                       | Summary                                                        |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — Schemas + services in `@pops/core-db`                   |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop from shared journal                                |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip router + AI Ops orchestrator to `getCoreDrizzle()` |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete or defer shim                                    |

## Out of Scope

- AI provider abstraction changes (anthropic, openai clients).
- Cost model / pricing updates (provider-side).
- Multi-model routing (separate AI Ops concern).
- Moving AI Ops orchestrator to a new container (Epic 08b).
