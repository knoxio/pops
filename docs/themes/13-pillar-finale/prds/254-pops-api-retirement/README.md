# PRD-254: Retire `apps/pops-api` — per-pillar handler relocation

> Epic: [Pillar isolation](../../epics/) (final-mile · monolith dissolution)
>
> Status: **In progress** — food + lists pilots in flight (one PR each); 5 USs queued for the larger pillars.

## Overview

The pillar architecture work shipped: per-pillar APIs (`pops-<x>-api`), per-pillar DBs, contracts, the typed `pillar('<x>').*` SDK, the registry, per-pillar Dockerfiles. **What didn't ship** is the actual relocation of tRPC handlers out of the legacy `apps/pops-api` monolith. The new pillar API containers only host thin slices (registry, settings, debrief skeleton, embeddings) — the bulk of business logic still lives in `apps/pops-api/src/modules/<pillar>/` reading `@pops/<pillar>-db` directly. This is the source of 100% of the 260 remaining cross-pillar H8 violations.

This PRD specifies the **per-pillar handler relocation** that finishes the migration. After it ships:

- `apps/pops-api` is deleted (or contains only legacy adapters slated for removal)
- Every pillar's tRPC routers live in `apps/pops-<pillar>-api/src/modules/`
- All cross-pillar interactions go through `pillar('<x>').*` SDK calls (no direct DB imports across boundaries)
- `.dependency-cruiser-known-violations.json` H8 entries drop to 0
- nginx routes `/trpc-<pillar>/*` directly to each pillar-api (the routing already supports this — PRD-232)

## Surface inventory (snapshot)

| Pillar    | Subdirs | Routers | Total .ts | H8 violations |
| --------- | ------: | ------: | --------: | ------------: |
| media     |      18 |      26 |       305 |            99 |
| cerebrum  |      18 |      14 |       250 |            49 |
| core      |      19 |      21 |       142 |            41 |
| finance   |       5 |       4 |        71 |            39 |
| inventory |       8 |       9 |        54 |            21 |
| food      |       5 |     n/a |       n/a |             7 |
| lists     |       5 |     n/a |       n/a |             4 |
| **TOTAL** |         |         |           |       **260** |

Food + lists are split out as standalone pilots (see [Pilots](#pilots)). The 5 USs below cover the larger pillars.

## Per-handler process (canonical)

1. Identify the feature directory under `apps/pops-api/src/modules/<pillar>/<feature>/`
2. `git mv` it to `apps/pops-<pillar>-api/src/modules/<feature>/`
3. Drop the `@pops/<pillar>-db` runtime-import → it's now an INTRA-pillar import (legal per dep-cruiser)
4. Mount the router on the pillar API's root router (`apps/pops-<pillar>-api/src/router.ts`)
5. Drop the wiring from `apps/pops-api/src/router.ts`
6. If a handler reaches into ANOTHER pillar's DB, flip to `await pillar('<other>').*` — if the SDK procedure doesn't exist, STOP and file as a precursor scoping issue
7. Move tests alongside; rewire mocks to the new package
8. Update `.dependency-cruiser-known-violations.json` — remove freshly resolved entries
9. Validate: `pnpm --filter @pops/<pillar>-api typecheck/test/build`, `pnpm --filter @pops/api typecheck/test/build`, `pnpm typecheck/lint/lint:boundaries`, husky hooks
10. nginx auto-routes via PRD-232 generator; smoke `/trpc-<pillar>/<route>` end-to-end on capivara post-deploy

## Business Rules

- **No new feature work.** Pure relocation. If a handler needs widening (e.g. PRD-248-style SDK shape mismatch), file as a precursor — don't ship a half-flip.
- **Cross-pillar reaches use SDK.** No direct cross-pillar DB imports allowed. If a handler reads another pillar's DB, it gets a typed-proxy flip in the same PR.
- **One-pillar PRs.** Don't mix pillars in a relocation PR. Easier review, smaller blast radius.
- **Sub-router slicing OK.** A pillar's relocation can ship as multiple PRs (one per `<feature>/` subtree). Each PR closes its own H8 entries.
- **Allow-list ratchets only down.** Every PR drops entries from `.dependency-cruiser-known-violations.json`. Net additions are forbidden.

## Pilots

| Pilot                           | Status       | PR  |
| ------------------------------- | ------------ | --- |
| Food (7 violations, 5 subdirs)  | 🟡 in flight | TBD |
| Lists (4 violations, 5 subdirs) | 🟡 in flight | TBD |

The pilots prove the canonical process. Findings (couplings, SDK gaps, test friction) feed back into this PRD before US-01..US-05 are dispatched.

## User Stories

| #   | Story                                 | Summary                                                                                                                                                                                                              | Parallelisable                                                                                                                                                                             |
| --- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 01  | [us-01-inventory](us-01-inventory.md) | Relocate 9 inventory routers + 21 H8 entries. Sub-router families: items, locations, photos, documents, document-files, reports, paperless, connections                                                              | Yes after pilots. Sub-families parallelisable (items, locations, photos are independent surfaces)                                                                                          |
| 02  | [us-02-finance](us-02-finance.md)     | Relocate 4 finance routers + 39 H8 entries. Families: transactions, budgets, imports, tag-suggester, wishlist                                                                                                        | Yes after pilots. imports + tag-suggester depend on cerebrum SDK (already exists); others standalone                                                                                       |
| 03  | [us-03-core](us-03-core.md)           | Relocate 21 core routers + 41 H8 entries. Families: ai-alerts, ai-budgets, ai-providers, ai-usage, ai-observability, corrections, embeddings, entities, envs, jobs, pillars, search, settings, shell, tag-rules, uri | Yes after pilots. **Settings already lives in pops-core-api** (PRD-247). Most ai-\* families are standalone.                                                                               |
| 04  | [us-04-cerebrum](us-04-cerebrum.md)   | Relocate 14 cerebrum routers + 49 H8 entries. Families: adapters, ai-tools, ego, emit, engrams, glia, ingest, nudges, plexus, query, reflex, retrieval, templates, thalamus, workers                                 | After core (some cerebrum handlers call core via SDK). Sub-families mostly independent within cerebrum.                                                                                    |
| 05  | [us-05-media](us-05-media.md)         | Relocate 26 media routers + 99 H8 entries. Families: arr, comparisons, discovery, library, lib, movies, plex, rotation, search, thetvdb, tmdb, tv-shows, uri-handler, watch-history, watchlist                       | Last. Largest surface, most coupling. Plex already migrated to SDK (PRD-247); arr/rotation already migrated. Comparisons + library + movies + tv-shows + watch-history + watchlist remain. |

## Parallelisation plan

Three waves. Each wave runs in parallel within itself:

**Wave A — pilots (now)**: food + lists (1 PR each). Validate the canonical process. Update this PRD with findings.

**Wave B — independent pillars (~3 PRs in parallel after pilots green)**:

- US-01 inventory
- US-02 finance
- US-03 core

Inventory, finance, core have minimal cross-pillar coupling. Each pillar gets one agent; agent can split into sub-PRs per family if the diff is large.

**Wave C — coupled pillars (after Wave B)**:

- US-04 cerebrum (depends on core SDK widenings if any)
- US-05 media (largest; depends on cerebrum SDK for AI features, on settings already in core-api)

Media can be sub-PR-sliced aggressively: `movies/`, `tv-shows/`, `library/`, `watchlist/`, `watch-history/`, `discovery/`, `search/` each ship independently. Comparisons / plex / arr / rotation already partially migrated — pick up the remaining files.

## Acceptance Criteria

- [ ] `apps/pops-api/src/modules/` is empty (or contains only documented adapters)
- [ ] `apps/pops-api/src/router.ts` mounts no per-pillar routers (only the dispatcher, if it remains)
- [ ] Every `pops-<pillar>-api` exposes its full router tree
- [ ] `.dependency-cruiser-known-violations.json` H8 violations = 0
- [ ] `pnpm typecheck/test/build/lint/lint:boundaries` clean across the monorepo
- [ ] nginx `/trpc-<pillar>/*` routes successfully end-to-end on capivara for every pillar
- [ ] `apps/pops-api/` either deleted entirely OR documented as containing only legacy adapters with retirement deadline

## Out of scope

- New tRPC procedures (only relocations)
- SDK widenings (precursor work if needed; document and defer)
- The `pops-worker` retirement (separate concern; its handlers don't cross pillar lines the same way)
- Per-pillar relocation of FE code in `packages/app-<x>/` (different concern; FE is already mostly aligned)
- PRD-253 colocation (`/pillars/<x>/` topology) — orthogonal; can land before or after

## References

- [Pillar isolation audit 2026-06](../../notes/pillar-isolation-audit-2026-06.md)
- [PRD-228](../228-dynamic-pillar-registration/README.md) — registry that enables runtime pillar discovery
- [PRD-232](../232-nginx-generator-dynamic-source/README.md) — nginx routing per pillar
- [PRD-244](../244-cross-pillar-sdk-surface/README.md) — typed proxy used for cross-pillar calls
- [PRD-247](../247-core-settings-sdk-surface/README.md) — settings already split out as a pattern example
- [PRD-253](../253-pillar-colocation/README.md) — orthogonal topology cleanup
- `apps/pops-api/src/modules/` — the surface being drained
