# PRD-212 Readiness Matrix

> Status: In progress (audit only). Snapshot date: 2026-06-13.
>
> Parent: [PRD-212 README](README.md). Gates: [PRD-213](../213-final-drop-migration/README.md).

This matrix enumerates every table still referenced by the pops-api
boot-time backfill arrays (`TABLE_COPIES`) inside
`apps/pops-api/src/db/*-backfill*.ts`, together with the writer-cutover
PRD that owns the table and the residual `getDrizzle()` (legacy
`pops.db` handle) call surface that still reaches it. The matrix is the
input to PRD-213 (drop `pops.db`): every row must reach the green
"backfill retired + zero readers" terminal state before the drop ships.

## Reading the matrix

- **Owner pillar**: the per-pillar SQLite file that now owns the
  canonical write path (`media.db`, `finance.db`, etc.).
- **Owner PRD**: the Wave-3 cutover PRD (165–186) responsible for the
  slice.
- **PR3 shipped?**: writer cutover landed (writes now target the pillar
  DB). Sourced from `git log` on `main`.
- **PR4 shipped?**: the corresponding `pops.db` table dropped + the
  backfill entry removed. _Only `movies` (PRD-165) has shipped its PR4
  so far_ (commit `39dfdaae`); the remaining slices are the gate PRD-212
  is auditing.
- **Blocks PRD-213?**: `Yes` if the row would prevent dropping `pops.db`
  today (writer cutover not landed, or backfill still active, or a
  non-test caller still reads via `getDrizzle()`).

## Per-table matrix

| Table                      | Owner pillar | Owner PRD                     | PR3 (writer cutover) | Backfill still active? | Blocks PRD-213? |
| -------------------------- | ------------ | ----------------------------- | -------------------- | ---------------------- | --------------- |
| `movies`                   | media        | PRD-165                       | Shipped (8fd43790)   | Retired (per 39dfdaae) | No              |
| `tv_shows`                 | media        | PRD-166                       | Shipped (cbbe451b)   | Yes                    | Yes             |
| `watchlist`                | media        | PRD-167                       | Shipped (1766720d)   | Yes                    | Yes             |
| `watch_history`            | media        | PRD-168                       | Shipped (0dfa8999)   | Yes                    | Yes             |
| `shelf_impressions`        | media        | PRD-170 (discovery)           | PR1 only (f29361b1)  | Yes                    | Yes             |
| `home_inventory`           | inventory    | PRD-173                       | PR2 only (748cd1f9)  | Yes                    | Yes             |
| `fixtures`                 | inventory    | PRD-173                       | PR2 only             | Yes                    | Yes             |
| `locations`                | inventory    | PRD-173                       | PR2 only             | Yes                    | Yes             |
| `item_connections`         | inventory    | PRD-175                       | Shipped (d09cb531)   | Yes                    | Yes             |
| `item_documents`           | inventory    | PRD-176                       | Shipped (7b404053)   | Yes                    | Yes             |
| `item_photos`              | inventory    | PRD-173                       | PR2 only             | Yes                    | Yes             |
| `item_uploaded_files`      | inventory    | PRD-173                       | PR2 only             | Yes                    | Yes             |
| `item_fixture_connections` | inventory    | PRD-173                       | PR2 only             | Yes                    | Yes             |
| `entities`                 | finance      | Theme 12 N3 / Epic 08a        | Shipped (Theme 12)   | Yes                    | Yes             |
| `transactions`             | finance      | Theme 12 N3                   | Shipped (Theme 12)   | Yes                    | Yes             |
| `transaction_corrections`  | finance      | Theme 12 N4 PR 3 (#2908)      | Shipped              | Yes                    | Yes             |
| `transaction_tag_rules`    | finance      | Theme 12 N4 PR 3 (#2908)      | Shipped              | Yes                    | Yes             |
| `tag_vocabulary`           | finance      | Theme 12 N4 PR 3 (#2908)      | Shipped              | Yes                    | Yes             |
| `budgets`                  | finance      | Theme 12                      | Shipped              | Yes                    | Yes             |
| `wish_list`                | finance      | Theme 12                      | Shipped              | Yes                    | Yes             |
| `nudge_log`                | cerebrum     | Wave-3 (router still legacy)  | Not started          | Yes                    | Yes             |
| `prep_states`              | food         | (food cutover, pre-Theme 13)  | Shipped              | Yes                    | Yes             |
| `slug_registry`            | food (slice) | (food cutover, pre-Theme 13)  | Shipped              | Yes                    | Yes             |
| `lists`                    | lists        | (lists cutover, pre-Theme 13) | Shipped              | Yes                    | Yes             |
| `list_items`               | lists        | (lists cutover, pre-Theme 13) | Shipped              | Yes                    | Yes             |
| `service_accounts`         | core         | (core cutover, pre-Theme 13)  | Shipped              | Yes                    | Yes             |
| `settings`                 | core         | PRD-183                       | Shipped (29fbf960)   | Yes                    | Yes             |
| `ai_inference_log`         | core         | PRD-186                       | Shipped (6650cfa0)   | Yes                    | Yes             |
| `ai_inference_daily`       | core         | PRD-186                       | Shipped (6650cfa0)   | Yes                    | Yes             |
| `ai_budgets`               | core         | PRD-186                       | Shipped (6650cfa0)   | Yes                    | Yes             |

**Totals**: 30 tables enumerated in active backfills. 1 retired
(`movies`). **29 tables blocking PRD-213** today.

## Residual `getDrizzle()` call sites (non-test)

`getDrizzle()` is the lazy singleton over `pops.db`. Every remaining
production call site is a writer-cutover gap (the slice's PR3 has not
landed yet) or an infra hot-path that has not been re-pointed at the
per-pillar handle. Tests, `*-handle.ts` JSDoc references, and the
`pillar-smoke-harness` (which is deliberately documenting legacy
behaviour) are excluded.

### Count by pillar (production code only)

| Pillar / area                               | Files with live `getDrizzle()` calls |
| ------------------------------------------- | -----------------------------------: |
| media                                       |                                   70 |
| core                                        |                                   21 |
| food                                        |                                   19 |
| cerebrum                                    |                                   18 |
| jobs / lib / routes / shared (cross-pillar) |                                   13 |
| finance                                     |                                    4 |
| lists                                       |                                    2 |

**Total: 147 production files still call `getDrizzle()` directly.**

### Notable cross-pillar / infra hot-paths

These do not belong to a single Wave-3 cutover PRD and need explicit
owners assigned before PRD-213 can ship:

| File                                                                | Reason still on `pops.db`                                                  | Suggested owner                             |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------- |
| `apps/pops-api/src/jobs/handlers/default.ts`                        | Generic job runner — reads `jobs` table                                    | Needs a new "jobs.db" decision or core flip |
| `apps/pops-api/src/jobs/handlers/embeddings-source.ts`              | Embeddings pipeline — reads source rows across pillars                     | core (embeddings owner)                     |
| `apps/pops-api/src/jobs/handlers/embeddings-helpers.ts`             | Same pipeline; 4 separate `getDrizzle()` call sites                        | core                                        |
| `apps/pops-api/src/jobs/sync-results.ts`                            | Sync result persistence                                                    | core                                        |
| `apps/pops-api/src/lib/inference-pricing.ts`                        | Reads `ai_provider_pricing` — Wave-3 PRD-186 left the pricing table behind | core (PRD-186 follow-up)                    |
| `apps/pops-api/src/routes/health.ts`                                | Health probe — touches `pops.db` to confirm it opens                       | Replace with per-pillar probes (PRD-213)    |
| `apps/pops-api/src/shared/tag-suggester.ts`                         | Cross-pillar tag suggester, reads `entities` + `tag_vocabulary`            | finance (post-08a)                          |
| `apps/pops-api/src/shared/pillar-smoke-harness.ts`                  | Documents the legacy behaviour; ok to keep until PRD-213 lands then delete | Theme 13 / PRD-213                          |
| `apps/pops-api/src/modules/core/ai-budgets/enforcement.ts` line 233 | Explicitly retained — joins `ai_providers` (still on pops.db)              | PRD-186 follow-up                           |

## Wave-3 status cross-reference

Summary of the 22 cutover PRDs (165–186) against the matrix above.
Sourced from `git log --all`.

| PRD     | Slice                     | PR2 (read flip)                            | PR3 (write flip) | PR4 (drop)      |
| ------- | ------------------------- | ------------------------------------------ | ---------------- | --------------- |
| PRD-165 | media.movies              | Done                                       | Done             | Done (39dfdaae) |
| PRD-166 | media.tvShows             | Done                                       | Done             | Not started     |
| PRD-167 | media.watchlist           | Done                                       | Done             | Not started     |
| PRD-168 | media.watchHistory        | Done                                       | Done             | Not started     |
| PRD-169 | media.library (read-flip) | Done (c7219031)                            | n/a              | n/a             |
| PRD-170 | media.discovery           | PR1 only                                   | Not started      | Not started     |
| PRD-171 | media.arr                 | Re-scoped: no slice to move                | n/a              | n/a             |
| PRD-172 | media.plex                | Deferred: no schema to move                | n/a              | n/a             |
| PRD-173 | inventory.items           | Done                                       | Not started      | Not started     |
| PRD-174 | inventory.reports         | Done by construction (runtime aggregation) | n/a              | n/a             |
| PRD-175 | inventory.connections     | Done                                       | Done             | Not started     |
| PRD-176 | inventory.documents       | Done                                       | Done             | Not started     |
| PRD-177 | inventory.paperless       | Done by construction (no tables)           | n/a              | n/a             |
| PRD-178 | inventory.warranties      | Done by construction (no schema)           | n/a              | n/a             |
| PRD-179 | cerebrum.engrams          | Done                                       | Done             | Not started     |
| PRD-180 | cerebrum.plexus           | Done                                       | Done             | Not started     |
| PRD-181 | cerebrum.glia             | Done                                       | Done             | Not started     |
| PRD-182 | cerebrum.conversations    | Done                                       | Done             | Not started     |
| PRD-183 | core.settings             | Done                                       | Done             | Not started     |
| PRD-184 | core.tagRules cleanup     | Pending Epic 08a verification              | n/a              | n/a             |
| PRD-185 | core.corrections cleanup  | Pending Epic 08a verification              | n/a              | n/a             |
| PRD-186 | core.aiUsage              | Done                                       | Done             | Not started     |

## Blockers for PRD-213

PRD-213 can ship only when every row above reads "Backfill retired" and
zero non-test `getDrizzle()` calls remain. As of 2026-06-13:

1. **29 of 30 backfilled tables still active.** Only `movies` has had
   its PR4 retire-backfill step land. Every remaining writer-cutover
   PRD (PRD-166, 167, 168, 170, 173, 175, 176, 179, 180, 181, 182, 183,
   186, plus the seven pre-Theme-13 finance/food/lists/core slices) owes
   a PR4 to remove its backfill entry + drop its `pops.db` columns.
2. **147 production files still call `getDrizzle()`.** Heaviest in
   `media` (70). The Wave-3 PRDs that report PR3 as done still leak read
   paths into `pops.db` because the routers grep above shows them. A
   per-PRD sweep is required as part of each PR4.
3. **Nine cross-pillar infra hot-paths have no owning Wave-3 PRD** —
   jobs, embeddings, inference-pricing, health, tag-suggester, ai-budget
   enforcement. These need owners assigned (or a dedicated PRD spun out
   under Epic 09) before PRD-213 can ship.
4. **Five documentation-only / deferred PRDs** (171, 172, 174, 177, 178)
   carry no work. PRD-184 and PRD-185 still need Epic 08a verification.

## Recommended sequence into PRD-213

1. Close PR4 on the 13 shipped-PR3 Wave-3 PRDs (drops backfill entries +
   `pops.db` table). Per-table; trivially parallelisable.
2. Ship PRD-170 / PRD-173 PR3 + PR4 (last writer cutovers).
3. Spin a small "infra detach" PRD under Epic 09 for the nine
   cross-pillar `getDrizzle()` hot-paths listed above.
4. Land PRD-213 (delete `pops.db` open + the `db.ts` legacy handle +
   `pillar-smoke-harness` legacy assertions).
