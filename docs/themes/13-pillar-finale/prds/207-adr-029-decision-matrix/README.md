# PRD-207: ADR-029 decision matrix

> Epic: [Cross-pillar code placement](../../epics/08b-cross-pillar-code-placement.md)

## Overview

Write ADR-029 (already stubbed) with concrete decisions per concern: search orchestrator, AI Ops orchestrator, `pops-worker`, URI dispatcher. The decisions drive PRDs 208-211. ADR-029's stub already names the recommendation: per-concern containers (`pops-search-api`, `pops-ai-api`) with worker staying as-is and URI dispatcher folding into the registry.

## Data Model

No data; ADR text only.

## API Surface

ADR-029's outcome:

- **Search → `pops-search-api`** (new container)
- **AI Ops → `pops-ai-api`** (new container)
- **Worker → stays as `pops-worker`** (just changes from in-process to SDK calls)
- **URI dispatcher → registry-driven** (no central dispatcher service)

## Business Rules

- Decision must be ratified by the user before implementation PRDs proceed.
- Each option's pros/cons are catalogued with concrete migration cost estimates.
- A migration plan per option is sketched.

## Edge Cases

| Case                                               | Behaviour                                                     |
| -------------------------------------------------- | ------------------------------------------------------------- |
| Future requirement contradicts an ADR-029 decision | Author a superseding ADR; ADR-029 stays as historical record. |

## User Stories

| #   | Story                                       | Summary                                                                  |
| --- | ------------------------------------------- | ------------------------------------------------------------------------ |
| 01  | [us-01-finalise-adr](us-01-finalise-adr.md) | Convert ADR-029 stub into Accepted state with full per-concern decisions |

## Out of Scope

- Implementation (PRDs 208-211).
