# PRD-252: Close H-D1 — per-pillar Dockerfile isolation

> Epic: [Pillar isolation](../../epics/) (final-mile)
>
> Status: **In progress**

## Overview

Audit 2026-06 surfaced a new HIGH (H-D1): every per-pillar -api Dockerfile copies the package.json AND src/ AND migrations/ of every other pillar's -db and -contract package, then builds 8 sibling packages before its own. Net effect:

- a finance-schema change rebuilds the core-api image
- a cerebrum migration appears in the finance-api image layers
- watchtower drags an unrelated pillar source into a deploy that does not need it

The Dockerfile comments blame pnpm workspace resolver, but only the package.json of every workspace member needs to be present at install time — src and migrations should not have to be copied for packages a pillar does not transitively depend on.

## Surface

- apps/pops-<pillar>-api/Dockerfile (x7) — replace with generator output
- scripts/generate-pillar-dockerfile.mjs (new) — reads package.json, walks transitive @pops/\* deps via pnpm m ls --filter <pillar>... --json, emits Dockerfile
- .github/workflows/<pillar>-image.yml (x7) — drift-check step

## Business Rules

- Generated, not hand-written. Drift-check fails the PR on hand-edits.
- Phase 1 (every workspace package.json) stays — pnpm needs it.
- Phase 2 narrows to transitive deps only.
- No new SDK/framework abstractions. Build-layer fix only.

## Edge Cases

| Case                               | Behaviour                                                   |
| ---------------------------------- | ----------------------------------------------------------- |
| Pillar adds new @pops/\* dep       | Generator picks up; CI drift-check fails until regenerated  |
| Pillar removes a dep               | Same                                                        |
| Two pillars share a transitive dep | Each Dockerfile lists it; BuildKit dedupes identical layers |
| Build order inside a Dockerfile    | Topology-aware via pnpm --filter <pillar>^... build         |

## User Stories

| #   | Story                                        | Status      | Parallelisable       |
| --- | -------------------------------------------- | ----------- | -------------------- |
| 01  | generator + drift-check (land with core-api) | Done        | Foundational         |
| 02  | cerebrum Dockerfile                          | Done        | After US-01          |
| 03  | finance Dockerfile                           | Not started | Parallel after US-01 |
| 04  | inventory Dockerfile                         | Not started | Parallel after US-01 |
| 05  | food Dockerfile                              | Done        | Parallel after US-01 |
| 06  | lists Dockerfile                             | Done        | Parallel after US-01 |
| 07  | media Dockerfile                             | Done        | Parallel after US-01 |

## Acceptance Criteria

- Each pillar Dockerfile copies src/ + migrations/ ONLY for transitive @pops/\* deps
- CI drift-check fails on a forced hand-edit
- docker buildx build completes locally for every pillar
- A finance-schema-only commit does NOT rebuild the cerebrum image

## Out of Scope

- Dockerfile multi-stage refactor
- Image-size optimisation beyond removing unnecessary src
- pops-shell Dockerfile (already independent enough)
- pops-api / pops-worker (legacy monolith)

## References

- Pillar isolation audit 2026-06 H-D1
- apps/pops-core-api/Dockerfile (current shape)
- ADR-026
- PRD-245 (../245-db-types-decomposition/README.md)
