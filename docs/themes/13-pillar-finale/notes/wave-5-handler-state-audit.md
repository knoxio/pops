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

| Category                              | Count | Notes                                                                                                                                                                                                                        |
| ------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handler-real callers                  | 0     | Every production handler under `inventory/{items,locations,connections,documents,document-files,fixtures,photos,reports,paperless}` already resolves via `getInventoryDrizzle()` from `../../../db/inventory-handle.js`.     |
| Documented intentional pins           | 0     | No inline JSDoc cross-pillar-pin rationale found.                                                                                                                                                                            |
| Shared-only schema pins               | 0     | No reads/writes against shared-only tables. Every table consumed by inventory services is exposed by `@pops/inventory-db`.                                                                                                   |
| JSDoc-only comment lines              | 0     | The JSDoc in `connections/service.ts`, `documents/service.ts`, `items/service.ts`, and `__integration__/inventory-handle-coverage.test.ts` references `getInventoryDrizzle()` (the pillar handle), not the shared handle.    |
| Test-mock callers                     | 0     | No `vi.mock('.../db.js', () => ({ getDrizzle: ... }))` shapes under `inventory/`.                                                                                                                                            |
| **Real handler migration candidates** | **0** | Pillar cutover is complete; no follow-up flips required.                                                                                                                                                                     |

The only `apps/pops-api/src/db.js` reference inside the inventory tree
is `__integration__/inventory-handle-coverage.test.ts` importing
`closeDb` + `setDb` to seed the shared in-memory DB used by the test
harness — these are lifecycle helpers, not `getDrizzle()` callers.

**Count delta: 0 → 0** (audit-doc row only; no code changes shipped on
this branch).

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

Applying this filter to finance, cerebrum, and inventory reduced raw
counts from 18, 26, and 0 to **0 + 2 + 0 real handler-real-caller
migrations** across all three pillars. The original "~485 callers"
Wave 5 sizing is almost certainly inflated by an order of magnitude.

## Recommendation for next audits

Before opening any further Wave 5 migration PR:

1. Re-run the raw grep against the remaining pillars
   (`core`, `media`, `lists`, `food`, `app-*`).
2. Bucket every hit into the four categories above (test-mock,
   documented-pin, shared-only schema, real-handler-candidate).
3. Only the **real-handler-candidate** bucket is in scope for the
   pillar cutover commit. Test-mock work belongs in a separate
   "verify-side handle hygiene" PR per pillar; documented pins belong
   to the PRD that owns the cross-pillar refactor.
4. Publish the per-pillar table so Wave 5 sizing converges to a real
   number rather than a grep total.

## What this branch changed

Two real handler-real-caller migrations:

- `apps/pops-api/src/modules/cerebrum/glia/digest-channels.ts:45`
  — `deliverShellDigest` writes to `nudgeLog` (a table re-exported by
  `@pops/cerebrum-db`); now resolves via `getCerebrumDrizzle()`.
- `apps/pops-api/src/modules/cerebrum/retrieval/router.ts:169`
  — `cerebrum.retrieval.stats` reads `engramIndex` row counts and
  `embeddings` source-type counts; both tables live in
  `@pops/cerebrum-db`, so the procedure now resolves via
  `getCerebrumDrizzle()`.

Both are behaviour-preserving: under `setupTestContext` both handles
resolve to the same in-memory DB, and in production the cerebrum
handle owns the same tables on disk via the cerebrum-db schema +
backfill.
