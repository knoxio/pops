# PRD-209: AI orchestrator relocation

> Epic: [Cross-pillar code placement](../../epics/08b-cross-pillar-code-placement.md)

## Overview

Move AI Ops (`core.aiUsage` + the `ai.*` router + model selection + budget enforcement) into a new `pops-ai-api` container. Replaces the AI surface on pops-api. After PRD-186 (`core.aiUsage` cutover), the data already lives in `core.db`; this PRD just relocates the orchestration code.

## Data Model

No new persistent data (the cache, budgets, log live in `core.db`).

## API Surface

New container `pops-ai-api` listens on port 3009. Exposes:

- `GET /health`
- tRPC `ai.*` namespace: `ai.generate`, `ai.categorize`, `ai.tools.list`, etc.

Uses `pillar('core').aiUsage.*` to read/write budgets, log, cache.

## Business Rules

- **Stateless.** Cache reads go through SDK to core.
- **Budget enforcement runs server-side here.** Every AI call first checks `core.aiUsage.budgets.checkAvailable`.
- **Tool list built dynamically per request** (PRD-201).
- **Provider clients (anthropic, openai) live in this container.**

## Edge Cases

| Case             | Behaviour                                                           |
| ---------------- | ------------------------------------------------------------------- |
| AI provider down | Existing retry semantics; surface to user.                          |
| Budget exhausted | 429 response; existing error path.                                  |
| core-api down    | Cannot fetch budgets; degraded mode — fall back to in-memory cache. |

## User Stories

| #   | Story                                                       | Summary                                      |
| --- | ----------------------------------------------------------- | -------------------------------------------- |
| 01  | [us-01-container-scaffold](us-01-container-scaffold.md)     | New `apps/pops-ai-api/`                      |
| 02  | [us-02-relocate-router](us-02-relocate-router.md)           | Move `ai.*` router from pops-api             |
| 03  | [us-03-budget-check-via-sdk](us-03-budget-check-via-sdk.md) | Budget check calls SDK instead of in-process |
| 04  | [us-04-tools-via-registry](us-04-tools-via-registry.md)     | Wire dynamic tool list (PRD-201)             |
| 05  | [us-05-deploy](us-05-deploy.md)                             | Compose + capivara deploy                    |

## Out of Scope

- AI provider abstraction changes.
- Per-conversation budget tracking (current global only).
- Multi-region provider routing.
