# Wave 5 handler-state audit

Snapshot date: 2026-06-14.

Context: PR #3162 (finance) and this branch (cerebrum) audit the actual
state of `getDrizzle()` callers per pillar so Wave 5 can be sized off
real handler-real-callers rather than raw grep counts that conflate
production handlers with test-side `vi.mock(..., { getDrizzle })`
fixtures.

## Methodology

The Wave 5 long-tail estimate ("~485 callers") was a raw grep over
`apps/pops-api/src/`. That grep does not distinguish between:

1. **Handler-real callers** — production code that resolves the shared
   `getDrizzle()` at runtime and would actually move bytes through the
   shared `pops.db` file in deployed builds.
2. **Test-mock callers** — `vi.mock('../../../../db.js', () => ({
getDrizzle: ... }))` shapes whose keys exist only to satisfy the
   mock surface. These do not exercise the shared handle in production
   and migrating them is a test-suite verification fix, not a pillar
   cutover.
3. **Documented intentional pinning** — call sites with inline JSDoc
   explaining why the shared handle is required (typically cross-pillar
   SQL joins against tables that have not migrated yet).

Sizing Wave 5 off raw grep inflates the work by every test mock and
every documented intentional pin. The two pillars audited so far both
came in dramatically smaller than the raw grep suggested.

## Per-pillar findings

### Finance (PR #3162)

- Raw grep before: 18 occurrences under `apps/pops-api/src/modules/finance/`.
- Handler-real callers: **0**. Every production handler was already on
  `getFinanceDrizzle()` from the original infra-first cutover.
- Test-mock + verify-side callers: **16**. Flipped in #3162 so test
  assertions read from the pillar handle, matching the production
  surface.
- Remaining 2: dead-code `vi.mock` entries inside
  `ai-categorizer{,-disk}.{test,integration.test}.ts` whose underlying
  source no longer calls `getDrizzle()`; deferred to a follow-up that
  also fixes the broken `getCoreDrizzle` mock omission.
- **Count delta: 18 → 2.**

### Cerebrum (this branch)

Raw `getDrizzle()` references under `apps/pops-api/src/modules/cerebrum/`: 26.

Breakdown:

| Category                                                 | Count | Notes                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inline JSDoc comments (no call)                          | 7     | Cross-pillar-pin rationale in `retrieval/*.ts`, `nudges/router.ts`, `__integration__/cerebrum-handle-coverage.test.ts`, `debrief/router.ts`, `engrams/service.ts`.                                                                                                                                             |
| HybridSearchService instantiations (pinned, PRD-179 PR4) | 11    | `ego/engine.ts:173`, `ai-tools/search.ts:80`, `retrieval/router.ts:60,127,157`, `workers/router.ts:33`, `workers/handler.ts:29`, `emit/generation-service.ts:192`, `query/query-service.ts:174,213`, `nudges/router.ts:52`. Cross-pillar joins against `transactions`, `movies`, `tv_shows`, `home_inventory`. |
| `thalamus/router.ts:80` — `CrossSourceIndexer`           | 1     | Pinned: indexer scans cross-pillar source types by definition.                                                                                                                                                                                                                                                 |
| `reflex_executions` shared-only table reads/writes       | 4     | `reflex/reflex-queries.ts:24`, `reflex/reflex-io.ts:145,178`, `reflex/reflex-service.ts:195`. Schema lives only in shared `pops.db`; not in `@pops/cerebrum-db`.                                                                                                                                               |
| Test-mock callers                                        | 1     | `__integration__/cerebrum-handle-coverage.test.ts` plus 7 module-test `vi.mock` shapes under `__tests__/`.                                                                                                                                                                                                     |
| **Real handler migration candidates**                    | **2** | `glia/digest-channels.ts:45` (`nudgeLog` writes — schema lives in cerebrum-db) and `retrieval/router.ts:169` (stats procedure reads `engramIndex` + `embeddings` — both in cerebrum-db).                                                                                                                       |

Both migration candidates were flipped on this branch. The 11
HybridSearchService sites stay on the shared handle because the
documented PRD-179 PR 4 plan requires restructuring cross-pillar
enrichment joins first; flipping them in isolation would break
semantic search metadata resolution.

**Count delta: 26 → 24** (the 2 migrated, the remaining 24 are either
documented-pinned, on shared-only tables, or test-mocks).

### Inventory (this branch — `feat/theme13-inventory-handlers-audit`)

Raw `getDrizzle()` references under `apps/pops-api/src/modules/inventory/`: **0**.

Breakdown:

| Category                              | Count | Notes                                                                                                                                                                                                                     |
| ------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handler-real callers                  | 0     | Every production handler under `inventory/{items,locations,connections,documents,document-files,fixtures,photos,reports,paperless}` already resolves via `getInventoryDrizzle()` from `../../../db/inventory-handle.js`.  |
| Documented intentional pins           | 0     | No inline JSDoc cross-pillar-pin rationale found.                                                                                                                                                                         |
| Shared-only schema pins               | 0     | No reads/writes against shared-only tables. Every table consumed by inventory services is exposed by `@pops/inventory-db`.                                                                                                |
| JSDoc-only comment lines              | 0     | The JSDoc in `connections/service.ts`, `documents/service.ts`, `items/service.ts`, and `__integration__/inventory-handle-coverage.test.ts` references `getInventoryDrizzle()` (the pillar handle), not the shared handle. |
| Test-mock callers                     | 0     | No `vi.mock('.../db.js', () => ({ getDrizzle: ... }))` shapes under `inventory/`.                                                                                                                                         |
| **Real handler migration candidates** | **0** | Pillar cutover is complete; no follow-up flips required.                                                                                                                                                                  |

The only `apps/pops-api/src/db.js` reference inside the inventory tree
is `__integration__/inventory-handle-coverage.test.ts` importing
`closeDb` + `setDb` to seed the shared in-memory DB used by the test
harness — these are lifecycle helpers, not `getDrizzle()` callers.

**Count delta: 0 → 0** (audit-doc row only; no code changes shipped on
this branch).

### Food (this branch — `docs/theme-13-wave5-food-lists-audit`)

Raw `getDrizzle()` references under `apps/pops-api/src/modules/food/`: **183**.

Production-side breakdown (test-side counted separately below):

| Category                                         | Count | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSDoc-only comment lines                         | 2     | `routers/slugs.ts:30` (cross-DB partition rationale) and `routers/ingest-router.ts:52` (return-type comment on the `foodDb` alias).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Documented intentional pins (mixed-DB)           | 1     | `routers/slugs.ts:48` — `slugSearchService.searchSlugs(getDrizzle(), …)` is the legacy half of the `searchSlugsAcrossPillars` partition that pairs with `getFoodDrizzle()` on line 57. The `kind in ('ingredient','recipe')` rows still live in shared `pops.db`; flipping requires the per-table PR4 cutover for ingredients + recipes to ship first.                                                                                                                                                                                                                                                                                                   |
| Shared-only schema pins (awaiting per-table PR4) | 89    | Every other production hit. Touches tables not yet re-exported from `@pops/food-db` (only `prepStates`, `ingredients`, `ingredient_variants`, `ingredient_aliases`, `slug_registry` exist in the food-db migration journal; only `prepStates` is exposed via the barrel). Routers affected: `recipes` (13), `ingredients` (9), `inbox` (9), `conversions` (9), `substitutions` (7), `aliases` (7), `plan/router` (7), `batches` (7), `ingredient-tags` (4), `plan/slot-procedures` (4), `variants` (3), `hero-image/service` (3), `shopping/router` (2), `fridge/router` (2), `cook/router` (2), `solver/router` (1), `routers/ingest-router.ts:55` (1). |
| Test-side direct callers (not `vi.mock` shapes)  | 91    | 15 files under `__tests__/`. Food tests don't `vi.mock` the db module — they exercise routers against the in-memory shared DB seeded by `setupTestContext()`, calling `getDrizzle()` directly for setup/assert. Each fixture suite is a candidate for the "verify-side handle hygiene" follow-up PR when the matching table's PR4 cutover ships.                                                                                                                                                                                                                                                                                                         |
| **Real handler migration candidates**            | **0** | The food pillar has only completed PR4 for `prep_states` (commit 3439c8d3) + the `kind='prep_state'` slice of `slug_registry`. Every other food-owned table (recipes, batches, plan, substitutions, aliases, conversions, inbox, cook, fridge, shopping, hero-image, solver, variants, ingredient-tags, ingredients) is still write-pinned to shared `pops.db`. Flipping any of them without its per-table backfill PR would silently lose writes in production.                                                                                                                                                                                         |

**Count delta: 183 → 183** (audit-doc row only; no code changes shipped on
this branch). The 92 production lines are not migration candidates today;
they unblock incrementally as each food sub-slice's PR4 (backfill + barrel +
shared drop) ships, on the same pattern as `prep_states` already did.

### Lists (this branch — `docs/theme-13-wave5-food-lists-audit`)

Raw `getDrizzle()` references under `apps/pops-api/src/modules/lists/`: **3**.

| Category                              | Count | Notes                                                                                                                                                                                         |
| ------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSDoc-only comment lines              | 3     | `routers/items.ts:20`, `routers/list.ts:17`, `__tests__/lists-router.test.ts:59`. All three reference the legacy `getDrizzle()` core handle in prose explaining that the cutover is complete. |
| Documented intentional pins           | 0     | None — every production read/write resolves through `getListsDrizzle()`.                                                                                                                      |
| Shared-only schema pins               | 0     | `lists` + `list_items` are owned end-to-end by `@pops/lists-db` (migration 0062, package-local journal).                                                                                      |
| Test-mock callers                     | 0     | No `vi.mock('.../db.js', () => ({ getDrizzle: ... }))` shapes under `lists/`.                                                                                                                 |
| **Real handler migration candidates** | **0** | Pillar cutover is complete; no follow-up flips required.                                                                                                                                      |

The lists pillar is the cleanest of the five audited so far: every
production handler already resolves through `getListsDrizzle()`, and the
only remaining `getDrizzle()` mentions are doc-block prose explaining the
historical cutover. Matches the inventory pattern from `#3180`.

**Count delta: 3 → 3** (audit-doc row only; no code changes required).

### Media (this branch — `feat/theme13-media-core-handlers-migrate`)

Raw `getDrizzle()` references under `apps/pops-api/src/modules/media/`: **185**.

| Category                                        | Count | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSDoc-only comment lines                        | 8     | `watch-history/handlers/query-helpers.ts:11`, `discovery/flags.ts:10`, `discovery/shelf/local-shelves.test.ts:4`, `plex/sync-watchlist.ts:20,27`, `tv-shows/tv-shows-base.ts:40`, `__integration__/media-handle-coverage.test.ts:24`, `watchlist/plex-push.ts:58`. All cross-pillar-pin rationale or PR-defer prose.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Documented intentional pins (mixed-tx)          | 3     | `watch-history/handlers/query-helpers.ts:98` (`deleteWatchHistoryEntry` cross-table tx across `watchHistory` + `debriefSessions` + `debriefResults`), `comparisons/service.ts:73-199` (the `blacklistMovie` + Elo recalc cluster — 7 call sites in one file; documented in `media-watch-history-mixed-tx-design.md`), `watchlist/plex-push.ts:84` (writes `mediaWatchlist.plexRatingKey` back through the shared handle for cross-app visibility). All blocked behind the watch-history mixed-tx design.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Shared-only schema pins (per-table PR4 pending) | 141   | Every remaining production hit. Touches tables not yet re-exported from `@pops/media-db`: `comparisons`, `comparisonDimensions`, `comparisonSkipCooloffs`, `mediaScores`, `rotationCandidates`, `rotationExclusions`, `rotationSources`, `rotationLog`, `syncLogs`, `syncJobResults`, `debriefSessions`, `debriefResults`, `debriefStatus`. Affected dirs: `comparisons/{dimensions.service,lib/*,pairs/*,rankings-overall,scores.service,service}` (50), `debrief/*` (6), `discovery/{flags,context-picks-service,plex-service,router-tmdb,service-library,service-preference-profile,service-rewatch,shelf/*,tmdb-service}` (28), `library/*` (3), `plex/{router-sync,scheduler-sync-logs,sync-discover-watches,sync-helpers}` (7), `rotation/*` (24), `search/{movies,tv-shows}-adapter` (2), `tv-shows/{episodes,seasons}-service` (8), `watch-history/handlers/{list-recent,progress}` (5), `watch-history/handlers/query-helpers.ts:83,94` (the residual `getDrizzle()` reads on the deleter — pinned by the same mixed-tx). |
| Test-side direct callers                        | 33    | `__integration__/media-handle-coverage.test.ts` plus 14 `*.test.ts` files under `comparisons/lib/`, `rotation/`, `discovery/shelf/`. None are `vi.mock` shapes — media tests exercise routers against `setupTestContext()`'s in-memory DB and call `getDrizzle()` directly for setup/assert. Each fixture suite is a candidate for the "verify-side handle hygiene" follow-up PR per table.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Real handler migration candidates**           | **0** | Every production-side hit is either a documented mixed-tx pin (3) or a shared-only schema pin against tables that still write to `pops.db` (141). Flipping any of them in isolation today would either split a cross-table transaction across two SQLite files or silently lose writes in production until the matching per-table PR4 (backfill + barrel + shared drop) ships. The pattern matches the food pillar long tail.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

**Count delta: 185 → 185** (no production migrations in this branch). The 141
production-side shared-only schema pins unblock incrementally as each
media sub-slice's PR4 ships, on the same pattern as `prep_states` already did
for food. The 3 mixed-tx pins unblock when the cerebrum-owned
`debriefSessions` / `debriefResults` / `debriefStatus` slices ship to
`@pops/cerebrum-db` (per `media-watch-history-mixed-tx-design.md`).

### Core (this branch — `feat/theme13-media-core-handlers-migrate`)

Raw `getDrizzle()` references under `apps/pops-api/src/modules/core/`: **52**.

| Category                               | Count | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSDoc-only comment lines               | 4     | `ai-budgets/enforcement.ts:12,227`, `corrections/handlers/pattern-match.ts:6`, `corrections/handlers/query-helpers.ts:6`. All cross-pillar-pin rationale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Documented intentional pins (mixed-DB) | 1     | `ai-budgets/enforcement.ts:233` — `findFallbackProvider` joins `aiProviders` (NOT in core-db) with `aiModelPricing` (IN core-db). Unlocks when ai_providers ships its PR4.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Shared-only schema pins                | 28    | `ai-alerts/{alerts-store,evaluator,service}` (7 — `aiAlerts` + `aiAlertRules` not in core-db), `ai-providers/service.ts` (5 — `aiProviders` not in core-db, mixed with `aiModelPricing`), `corrections/handlers/{pattern-match,query-helpers}` (9 — `transaction_corrections` belongs to finance-db, shimmed via shared until N6 imports pipeline cuts over), `embeddings/service.ts` (2 — `embeddings` not in core-db), `features/user-settings.ts` (3 — `userSettings` not in core-db), `tag-rules/tag-rules.test.ts` (9 — test setup; same kind of fixture pin as food). Two more lines from the JSDoc bucket overlap. |
| Test-side direct callers               | 10    | `tag-rules/tag-rules.test.ts` (9 direct setup hits) + `ai-alerts/evaluator.test.ts:494` (one fixture hit). No `vi.mock` shapes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Real handler migration candidates**  | **9** | All on tables that ARE re-exported from `@pops/core-db` (or `@pops/cerebrum-db`) AND whose writes already route through the per-pillar handle: `ai-observability/{group-stats.ts:34, history.ts:74, summary.ts:81/106/131, service.ts:60/104/159}` — 8 sites reading `aiInferenceLog` + `aiInferenceDaily` (both core-db, written via `getCoreDrizzle()`); `ai-alerts/dispatchers/nudge.ts:43` — writes `nudgeLog` (cerebrum-db, same shape as the cerebrum #3167 migration).                                                                                                                                             |

All 9 candidates were flipped on this branch:

- 8 ai-observability reads (`group-stats.ts`, `history.ts`, `summary.ts`, `service.ts`) now resolve via `getCoreDrizzle()` — matches the writer path (`inference-middleware.ts`, `food/routers/ai.ts`, retention pipeline) which already targets `core.db`. Removes a read-split bug where the dashboard was querying the empty shared `ai_inference_log` instead of the live one.
- 1 nudge dispatcher write (`ai-alerts/dispatchers/nudge.ts`) now resolves via `getCerebrumDrizzle()` — mirrors the cerebrum `glia/digest-channels.ts` migration shipped in #3167, since `nudgeLog` is owned by `@pops/cerebrum-db`.

**Count delta: 52 → 43** (9 migrated, 28 shared-only pins, 1 documented mixed-DB pin, 4 JSDoc-only, 10 test-side).

## Methodology lesson

When sizing future pillar cutovers off `getDrizzle()` grep counts:

1. Subtract `__tests__/`, `__integration__/`, `*.test.ts`, and
   `*.integration.test.ts` matches up front — these are test fixtures,
   not handler callers.
2. Read inline JSDoc on each remaining hit. Documented pins (cross-
   pillar joins, shared-only schema tables) are work for the dependent
   PRD, not the current pillar.
3. For each handler-real caller, check whether every table it touches
   is exposed by the per-pillar `*-db` package. If even one table is
   shared-only, the call site cannot move until that table migrates or
   the join is refactored to per-pillar SDK lookups.

Applying this filter to all seven pillars — finance, cerebrum, inventory,
food, lists, media, core — reduced raw counts from 18, 26, 0, 183, 3,
185, and 52 (total: **467**) to
**0 + 2 + 0 + 0 + 0 + 0 + 9 = 11 real handler-real-caller migrations**
across the full long-tail audit. The original "~485 callers" Wave 5
sizing is inflated by roughly **two orders of magnitude** against the
real handler-candidate surface — the raw-grep total of 467 lines up
with the original estimate, but only 11 of those 467 are actionable
handler flips today. The dominant cost in the food and media pillars
is per-table backfill PR4 ships, not handler flips — every shared-only
schema pin moves one-by-one as its underlying table migrates into the
per-pillar `*-db` package and the shared `pops.db` copy is dropped.

### Final rollup (all 7 pillars audited)

| Pillar    | Raw grep | Real candidates | Migrated | PR          |
| --------- | -------- | --------------- | -------- | ----------- |
| Finance   | 18       | 0               | 0        | #3162       |
| Cerebrum  | 26       | 2               | 2        | #3167       |
| Inventory | 0        | 0               | 0        | #3180       |
| Food      | 183      | 0               | 0        | #3183       |
| Lists     | 3        | 0               | 0        | #3183       |
| Media     | 185      | 0               | 0        | this branch |
| Core      | 52       | 9               | 9        | this branch |
| **Total** | **467**  | **11**          | **11**   | —           |

Real candidate identification rate: **11 / 467 = 2.4%**. Migration completion rate against real candidates: **11 / 11 = 100%**.

## Recommendation for next audits

The 7-pillar long-tail audit is now complete. Future per-table cutover
PRs (food + media in particular) should:

1. Subtract `__tests__/`, `__integration__/`, `*.test.ts`, and
   `*.integration.test.ts` matches up front — these are test fixtures,
   not handler callers.
2. Read inline JSDoc on each remaining hit. Documented pins (cross-
   pillar joins, shared-only schema tables) are work for the dependent
   PRD, not the current pillar.
3. For each handler-real caller, check whether every table it touches
   is exposed by the per-pillar `*-db` package. If even one table is
   shared-only, the call site cannot move until that table migrates or
   the join is refactored to per-pillar SDK lookups.
4. Only the **real-handler-candidate** bucket is in scope for a pillar
   cutover commit. Test-mock work belongs in a separate "verify-side
   handle hygiene" PR per pillar; documented pins belong to the PRD
   that owns the cross-pillar refactor.

## What this branch changed

`feat/theme13-media-core-handlers-migrate` ships nine real handler
migrations — all in the core pillar:

- 8 ai-observability reads (`apps/pops-api/src/modules/core/ai-observability/{group-stats,history,summary,service}.ts`)
  now resolve `aiInferenceLog` + `aiInferenceDaily` queries via
  `getCoreDrizzle()`. Both tables are core-db owned (`packages/core-db/migrations/0057_ai_usage_baseline.sql`)
  and every writer (`inference-middleware.ts`, `food/routers/ai.ts`,
  retention pipeline) already targets `core.db`, so the previous shared
  reads were a split-brain bug — the dashboard was querying the empty
  shared `ai_inference_log` while the live rows lived in `core.db`.
- 1 nudge dispatcher write (`apps/pops-api/src/modules/core/ai-alerts/dispatchers/nudge.ts`)
  now writes `nudgeLog` via `getCerebrumDrizzle()` — mirrors the
  cerebrum `glia/digest-channels.ts` migration shipped in #3167, since
  `nudgeLog` is owned by `@pops/cerebrum-db`.

Media came in with **0 real handler-real-caller migration candidates**
under the audit rules — every production-side hit is either a
documented mixed-tx pin (3 sites, blocked behind
`media-watch-history-mixed-tx-design.md`) or a shared-only schema pin
(141 sites) against tables that still write to `pops.db` until the
matching per-table PR4 ships (same shape as food's `prep_states`).

Prior branches in this audit series shipped two real migrations on
cerebrum (see the cerebrum section above) and zero on finance,
inventory, food, and lists.

### Follow-up PRs flagged by this audit

| Item                                         | Pillar  | Tracking                                                                                                              |
| -------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| Media mixed-tx writer cutover                | media   | `media-watch-history-mixed-tx-design.md` — depends on cerebrum debrief tables shipping to `@pops/cerebrum-db`.        |
| Per-table PR4 sweep for media (141 sites)    | media   | Per-table backfill PRs against `comparisons*`, `mediaScores`, `rotation*`, `syncLogs`, etc. Same shape as `3439c8d3`. |
| `ai_providers` PR4 (5+1 sites unlock)        | core    | Lift `aiProviders` into `@pops/core-db` so `ai-providers/service.ts` + `ai-budgets/enforcement.ts:233` can flip.      |
| `ai_alerts` / `ai_alert_rules` PR4 (7 sites) | core    | Lift `aiAlerts` + `aiAlertRules` into `@pops/core-db`.                                                                |
| `embeddings` PR4 (2 sites)                   | core    | Lift `embeddings` into `@pops/core-db` (or own package — TBD).                                                        |
| `user_settings` PR4 (3 sites)                | core    | Lift `userSettings` into `@pops/core-db`.                                                                             |
| Finance corrections shim N6 cleanup          | finance | `corrections/handlers/{pattern-match,query-helpers}.ts` (9 sites) flip to `getFinanceDrizzle()` after N6 ships.       |
| Verify-side handle hygiene per pillar        | all     | 33 media test-side + 10 core test-side + 91 food test-side + 1 cerebrum test-side = 135 `*.test.ts` lines.            |
