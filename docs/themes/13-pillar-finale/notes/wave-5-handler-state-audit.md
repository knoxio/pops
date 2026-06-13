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

Applying this filter to finance, cerebrum, inventory, food, and lists
reduced raw counts from 18, 26, 0, 183, and 3 (total: **230**) to
**0 + 2 + 0 + 0 + 0 = 2 real handler-real-caller migrations** across
all five pillars audited. The original "~485 callers" Wave 5 sizing is
inflated by **two orders of magnitude** against the real
handler-candidate surface, and even the raw-grep total across the long
tail does not approach the original estimate. The dominant cost in the
food pillar is per-table backfill PR4 ships, not handler flips — the
89 shared-only schema pins each move one-by-one as their underlying
table migrates into `@pops/food-db` and the shared `pops.db` copy is
dropped.

## Recommendation for next audits

Before opening any further Wave 5 migration PR:

1. Re-run the raw grep against the remaining pillars
   (`core`, `media`, `app-*`).
2. Bucket every hit into the four categories above (test-mock,
   documented-pin, shared-only schema, real-handler-candidate).
3. Only the **real-handler-candidate** bucket is in scope for the
   pillar cutover commit. Test-mock work belongs in a separate
   "verify-side handle hygiene" PR per pillar; documented pins belong
   to the PRD that owns the cross-pillar refactor.
4. Publish the per-pillar table so Wave 5 sizing converges to a real
   number rather than a grep total.

## What this branch changed

`docs/theme-13-wave5-food-lists-audit` is documentation-only — both
food and lists came in with **0 real handler-real-caller migration
candidates** under the audit rules:

- Lists: every production handler is already on `getListsDrizzle()`;
  the three raw-grep hits are all JSDoc prose referencing the legacy
  shared handle.
- Food: only the `prep_states` slice has completed its PR4 cutover.
  The remaining 89 production-side `getDrizzle()` calls each await
  their own per-table backfill PR (the same shape as commit
  `3439c8d3` for prep_states) before they become safely flippable. One
  documented mixed-DB pin (`routers/slugs.ts:48`) is intentional and
  unlocks when ingredients + recipes complete their PR4s. Flipping any
  of these in isolation today would silently lose writes in production.

Prior branches in this audit series shipped two real migrations
(both on the cerebrum pillar — see the cerebrum section above).
