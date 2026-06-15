# PRD-245: `@pops/db-types` decomposition + cross-pillar FK drop

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)
>
> Status: **Done** — all eight user stories merged. `packages/db-types/src/schema/` deleted; `@pops/db-types` slimmed to a constants-only frontend-safe surface. Audit H6/H7 closed.

## Overview

`packages/db-types/src/schema/` is a single platform-level barrel that hosts 138 drizzle table definitions spanning every pillar (cerebrum, core, finance, food, inventory, lists, media, ego). Every per-pillar `-db` package (`media-db`, `cerebrum-db`, `finance-db`, `inventory-db`, `core-db`, …) re-exports its tables from `@pops/db-types` rather than owning them locally — `packages/ha-bridge-db/src/schema.ts` is the only package that owns its tables in-place, and that is the correct pattern.

This PRD relocates each pillar's schema files into its owning `-db` package, drops the four cross-pillar FK pairs that violate [ADR-026](../../../../architecture/adr-026-pillar-architecture.md) along the way, and finishes by deleting `packages/db-types/src/schema/` entirely. The remaining non-schema surface of `@pops/db-types` (constants, insert-types, embeddings, food shim, lists shim, pillar-registry) is out of scope and stays where it is until a follow-up PRD picks it up.

## Background

Audit [#3215](https://github.com/knoxio/pops/issues/3215) findings [H6 + H7](../../notes/pillar-isolation-audit.md):

- **H6** — `@pops/db-types` is a monolithic cross-pillar schema package. Every pillar `-db` package re-exports from it, so adding a pillar (or splitting one further) requires editing this shared package. External pillars cannot land here at all. ADR-026 calls the fix explicitly: "`@pops/db-types` distributes its schemas to each pillar's `-db` package + `core-db`."
- **H7** — Four cross-pillar FK pairs live inside `packages/db-types/src/schema/`. ADR-026 forbids them ("Each pillar owns its own SQLite database. No cross-pillar FKs") because SQLite-per-pillar physically cannot enforce them across files. PR [#3198](https://github.com/knoxio/pops/pull/3198) established the replacement pattern for the cerebrum → media pair: drop the FK at the schema level and rely on a soft `(media_type, media_id)` cross-pillar reference resolved over the wire via the URI dispatcher.

The two findings are entangled — the cross-pillar FK declarations are why each pillar's `-db` package can't safely own its schema today. A clean decomposition has to drop the FK in the same move that physically relocates the table.

The pattern for this PRD mirrors [PRD-239](../239-settings-manifest-physical-relocation/README.md): per-pillar physical relocation, one US per pillar, finishing US deletes the legacy directory.

## Cross-pillar FK inventory (audit H7, verified 2026-06-14)

| File:line                                                  | FK column → target                            | Owner → Target      | US    |
| ---------------------------------------------------------- | --------------------------------------------- | ------------------- | ----- |
| `packages/db-types/src/schema/debrief-sessions.ts:26`      | `watch_history_id` → `watchHistory.id`        | cerebrum → media    | US-01 |
| `packages/db-types/src/schema/debrief-status.ts:14`        | `dimension_id` → `comparisonDimensions.id`    | cerebrum → media    | US-01 |
| `packages/db-types/src/schema/debrief-results.ts:15`       | `dimension_id` → `comparisonDimensions.id`    | cerebrum → media    | US-01 |
| `packages/db-types/src/schema/debrief-results.ts:16`       | `comparison_id` → `comparisons.id`            | cerebrum → media    | US-01 |
| `packages/db-types/src/schema/inventory.ts:29`             | `purchase_transaction_id` → `transactions.id` | inventory → finance | US-02 |
| `packages/db-types/src/schema/inventory.ts:32`             | `purchased_from_id` → `entities.id`           | inventory → core    | US-02 |
| `packages/db-types/src/schema/transactions.ts:18`          | `entity_id` → `entities.id`                   | finance → core      | US-03 |
| `packages/db-types/src/schema/transaction-tag-rules.ts:17` | `entity_id` → `entities.id`                   | finance → core      | US-03 |

`debrief-sessions` already carries the denormalised `(media_type, media_id)` tuple per PR [#3198](https://github.com/knoxio/pops/pull/3198) — the FK column stays but loses its `.references()` clause. `debrief-status` and `inventory` likewise carry the foreign id as a plain text/uuid column; only the `.references()` clause comes off.

`corrections.ts:16` (`entity_id` → `entities.id`) and `media-scores.ts:14` (`dimension_id` → `comparisonDimensions.id`) are intra-pillar and stay as-is.

## Proposed shape

1. **Per-pillar relocation.** Each pillar's drizzle table files move out of `packages/db-types/src/schema/<pillar-files>` and into the owning `-db` package's `src/schema/` directory. The `-db` package becomes the canonical home; the package's existing `schema.ts` barrel switches from re-exporting `@pops/db-types` to exporting its own files.
2. **FK drop on the way through.** For each table being relocated that declares a cross-pillar `.references()` clause, the relocation diff drops the `.references(...)` call (the column stays). No new schema-level FK is added at the destination — cross-pillar resolution stays in application code through the URI dispatcher / wire-format soft refs, per ADR-026 and PR #3198.
3. **`db-types/src/schema/index.ts` re-export shim during transition.** Each per-pillar US leaves the corresponding lines in `packages/db-types/src/schema/index.ts` pointing at the new home — either via a `from '@pops/<pillar>-db'` re-export, or by leaving the existing file in place as a thin re-export until the final US deletes the directory. Pick whichever is mechanically simpler per US; the public surface of `@pops/db-types` stays stable until US-08.
4. **Final cleanup.** Once every pillar relocation has merged, the finishing US deletes `packages/db-types/src/schema/` and the schema-related entries in `packages/db-types/src/index.ts`. `@pops/db-types`'s remaining surface (`constants.ts`, `embeddings.ts`, `food.ts`, `lists.ts`, `insert-types.ts`, `pillar-registry.ts`) survives as-is and is left for a follow-up scoping pass.

## Target homes

| Source files (in `packages/db-types/src/schema/`)                                                                                                                                                                                                                                                                                                                                                   | Target package                               | US    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----- |
| `debrief-sessions.ts`, `debrief-status.ts`, `debrief-results.ts`, `engrams.ts`, `glia.ts`, `ego.ts`, `episodes.ts`, `plexus.ts`, `nudge-log.ts`, `reflex-executions.ts`, `embeddings.ts` (under `core/` today), plus matching `*-row-schemas.ts`                                                                                                                                                    | `@pops/cerebrum-db`                          | US-01 |
| `inventory.ts`, `item-connections.ts`, `item-fixture-connections.ts`, `item-documents.ts`, `item-photos.ts`, `item-uploaded-files.ts`, `locations.ts`, `fixtures.ts`, plus matching `*-row-schemas.ts`                                                                                                                                                                                              | `@pops/inventory-db`                         | US-02 |
| `transactions.ts`, `transaction-tag-rules.ts`, `budgets.ts`, `corrections.ts`, `tag-vocabulary.ts`, `wishlist.ts`, `tier-overrides.ts`, plus matching `*-row-schemas.ts`                                                                                                                                                                                                                            | `@pops/finance-db`                           | US-03 |
| `comparison-dimensions.ts`, `comparison-skip-cooloffs.ts`, `comparison-staleness.ts`, `comparisons.ts`, `dismissed-discover.ts`, `media-scores.ts`, `media-watchlist.ts`, `movies.ts`, `rotation-candidates.ts`, `rotation-exclusions.ts`, `rotation-log.ts`, `rotation-sources.ts`, `seasons.ts`, `shelf-impressions.ts`, `sync-logs.ts`, `sync-job-results.ts`, `tv-shows.ts`, `watch-history.ts` | `@pops/media-db`                             | US-04 |
| All `food-*.ts` (`food-batches.ts`, `food-compile.ts`, `food-conversions.ts`, `food-ingest-sources.ts`, `food-ingredients.ts`, `food-plan.ts`, `food-recipes.ts`, `food-rejections.ts`, `food-substitutions.ts`, `food.ts`) plus matching `*-row-schemas.ts`                                                                                                                                        | `@pops/food-db` (and/or `@pops/app-food-db`) | US-05 |
| `lists.ts`, plus matching `lists-row-schemas.ts`                                                                                                                                                                                                                                                                                                                                                    | `@pops/app-lists-db`                         | US-06 |
| `core/`, `entities.ts`, `environments.ts`, `pillar-registry.ts`, `service-accounts.ts`, `settings.ts`, `user-settings.ts`, `ai-*.ts`, plus matching `*-row-schemas.ts`                                                                                                                                                                                                                              | `@pops/core-db`                              | US-07 |
| —                                                                                                                                                                                                                                                                                                                                                                                                   | delete `packages/db-types/src/schema/`       | US-08 |

The exact file partition per pillar is finalised by the implementing US — the audit's per-file pillar assignment is the source of truth where the file name is ambiguous. AI tables (`ai-*.ts`) and `embeddings.ts` park under their existing owners per [PRD-239](../239-settings-manifest-physical-relocation/README.md) precedent (ai under core, embeddings under cerebrum).

## API Surface

After US-01 … US-07 land:

```
@pops/cerebrum-db       →  owns debrief-*, engrams, glia, ego, episodes, plexus, nudge-log, reflex-executions, embeddings
@pops/inventory-db      →  owns home-inventory, item-*, locations, fixtures
@pops/finance-db        →  owns transactions, transaction-tag-rules, budgets, corrections, tag-vocabulary, wishlist, tier-overrides
@pops/media-db          →  owns movies, tv-shows, seasons, episodes (media), watchlist, watch-history, comparisons, rotations, …
@pops/food-db           →  owns food-* tables
@pops/app-lists-db      →  owns lists + list-items
@pops/core-db           →  owns entities, environments, settings, user-settings, ai-*, service-accounts, pillar-registry
@pops/db-types/schema   →  thin re-export shim during transition; deleted by US-08
```

`@pops/db-types`'s schema barrel deletes at US-08. Existing consumers (~440 import sites across `apps/` and `packages/`) that still read `from '@pops/db-types'` are repointed at the per-pillar package as part of each pillar's US — that is the bulk of the diff.

## Business Rules

- **Pure physical move.** Table definitions, column types, indexes, and exported names are unchanged. The single intentional shape change is dropping `.references()` calls on the eight cross-pillar FK columns listed in the H7 table above. The columns themselves stay, including their types and `onDelete: 'set null'` semantics (the latter becomes a no-op without the FK but is left in the column declaration as a documentation marker that the value is permitted to be null).
- **No new public surface beyond what each `-db` package already exports.** The destination package's existing `schema.ts` barrel grows; no new subpath is introduced.
- **`@pops/db-types/schema` re-export stays stable until US-08.** Each per-pillar US either repoints the re-export at the new home or repoints consumers directly — picked per-US to keep the diff small. The external public surface of `@pops/db-types` does not change until US-08 deletes it.
- **No table renames, no column renames, no migration churn.** Drizzle-kit picks up the relocated files automatically because the `-db` packages already participate in the schema glob.
- **No new `as any` / `as unknown as Type` casts. No `eslint-disable` / `ts-ignore`.**
- **Tests stay co-located with their source.** Existing `*-row-schemas.ts` files travel with the table they describe. Smoke-import tests inside the receiving package assert the table still resolves to the same `name`.

## Edge Cases

| Case                                                                                                                                                           | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db-types/src/schema/index.ts` is a flat per-table re-export list (one line per export). Every relocation US edits the same file.                              | Land USs **serially**, not in parallel. The PRD-239 collision lesson applies here too: parallel-merging USs that all touch the same SDK barrel produced merge collisions in PRs #3207/#3209/#3210. Serial merging trades a small amount of latency for zero merge friction. Recommended order: US-07 core → US-04 media → US-01 cerebrum → US-03 finance → US-02 inventory → US-05 food → US-06 lists → US-08 cleanup. |
| A cross-pillar FK column needs an application-level resolver to replace the dropped constraint                                                                 | Out of scope. The audit explicitly observes the FKs were already moot at runtime (SQLite-per-pillar cannot enforce them across files). Application-level resolution lives in consumer code today, not in the schema. If a consumer relied on the FK for cascading `set null`, that behaviour disappears with the FK — flag it on the US.                                                                               |
| A relocation surfaces a circular import between two `-db` packages (e.g. cerebrum-db's `debrief_results` referenced something inside media-db's `comparisons`) | The FK drop removes the import. After dropping the `.references()` calls, no cross-`-db`-package imports remain — the audit verified the four FK pairs are the only cross-pillar references in `packages/db-types/src/schema/`.                                                                                                                                                                                        |
| `*-row-schemas.ts` files (drizzle-zod row schemas) co-locate next to their table                                                                               | They travel with the table in the same US. No separate move.                                                                                                                                                                                                                                                                                                                                                           |
| `core/embeddings.ts` and `core/` subdirectory inside `db-types/src/schema/`                                                                                    | The `core/` subdirectory is the existing partial-relocation seam. Files there move with the rest of the core US-07 batch; `embeddings.ts` moves with cerebrum US-01 per audit attribution.                                                                                                                                                                                                                             |
| Drizzle-kit's schema glob (`packages/db-types/src/schema/*`)                                                                                                   | The drizzle-kit config edits as part of US-08 (or earlier if convenient) to glob each `-db` package's `src/schema/` directory instead. Verify before US-08 lands.                                                                                                                                                                                                                                                      |
| `apps/pops-api` and other consumers still import `from '@pops/db-types'`                                                                                       | Each per-pillar US repoints the consumers it owns (e.g. cerebrum's US-01 repoints `apps/pops-api/src/modules/cerebrum/...` imports). Consumers not owned by any pillar (cross-module callers flagged under audit H8) stay on `@pops/db-types` via the transition shim and migrate as part of [PRD-156](../156-consumer-import-discipline/README.md) follow-ups.                                                        |

## User Stories

| #   | Story                                                                   | Summary                                                                                                                                                                                                                         | Parallelisable                    |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 01  | [us-01-relocate-cerebrum-schemas](us-01-relocate-cerebrum-schemas.md)   | Move cerebrum tables into `@pops/cerebrum-db`. Drop the four cerebrum → media FKs (debrief-sessions, debrief-status, debrief-results × 2). `(media_type, media_id)` denorm is already in place per PR #3198.                    | **No** — shares the schema barrel |
| 02  | [us-02-relocate-inventory-schemas](us-02-relocate-inventory-schemas.md) | Move inventory tables into `@pops/inventory-db`. Drop `inventory.ts:29` (→ finance.transactions) and `inventory.ts:32` (→ core.entities). Columns stay; `.references()` clauses come off.                                       | **No** — shares the schema barrel |
| 03  | [us-03-relocate-finance-schemas](us-03-relocate-finance-schemas.md)     | Move finance tables into `@pops/finance-db`. Drop `transactions.ts:18` and `transaction-tag-rules.ts:17` (→ core.entities).                                                                                                     | **No** — shares the schema barrel |
| 04  | [us-04-relocate-media-schemas](us-04-relocate-media-schemas.md)         | Move media tables into `@pops/media-db`. No cross-pillar FKs to drop (intra-media only).                                                                                                                                        | **No** — shares the schema barrel |
| 05  | [us-05-relocate-food-schemas](us-05-relocate-food-schemas.md)           | Move food tables into `@pops/food-db` / `@pops/app-food-db` per existing layout. No cross-pillar FKs.                                                                                                                           | **No** — shares the schema barrel |
| 06  | [us-06-relocate-lists-schemas](us-06-relocate-lists-schemas.md)         | Move `lists` + `list-items` into `@pops/app-lists-db`. No cross-pillar FKs.                                                                                                                                                     | **No** — shares the schema barrel |
| 07  | [us-07-relocate-core-schemas](us-07-relocate-core-schemas.md)           | Move core tables (entities, environments, settings, ai-\*, service-accounts, pillar-registry, corrections) into `@pops/core-db`. No cross-pillar FKs (intra-core only).                                                         | **No** — shares the schema barrel |
| 08  | [us-08-delete-db-types-schema-dir](us-08-delete-db-types-schema-dir.md) | Delete `packages/db-types/src/schema/`. Repoint drizzle-kit globs at per-pillar `-db` packages. Verify no consumer of `@pops/db-types`'s schema surface remains. Audit which workspace deps on `@pops/db-types` are now unused. | Blocked by us-01 … us-07          |

**Recommended merge order:** US-07 (core) → US-04 (media) → US-01 (cerebrum) → US-03 (finance) → US-02 (inventory) → US-05 (food) → US-06 (lists) → US-08 (cleanup). Core and media land first because they are the link targets of the dropped FKs — getting their final homes settled before cerebrum/inventory/finance relocate avoids a window where a relocated table still has a `.references()` pointing at a table that moved underneath it.

USs **cannot** run in parallel. PRD-239's parallel-merge attempt produced three colliding PRs (#3207, #3209, #3210) all touching the same SDK barrel; this PRD has the same shape — every US edits `packages/db-types/src/schema/index.ts` (and likely `packages/db-types/src/index.ts`) to either re-route a re-export or remove a line. Serial merging trades wall-clock latency for zero rebase friction.

## Acceptance Criteria

Tracked per-US — summary here for orientation:

- Every drizzle table file previously under `packages/db-types/src/schema/` lives in its owning `-db` package's `src/schema/` directory.
- The eight cross-pillar `.references()` calls in the H7 table above are deleted. No new schema-level cross-pillar FK is introduced.
- `packages/db-types/src/schema/` is deleted; the schema-related entries in `packages/db-types/src/index.ts` are removed.
- Drizzle-kit's schema globs are repointed at per-pillar `-db` packages and a `pnpm drizzle:check` (or equivalent) reports no schema drift.
- `grep -rn "from '@pops/db-types'" packages apps` under `src/` shows zero matches against the relocated table names. (Non-schema surfaces of `@pops/db-types` — constants, insert-types, embeddings — may still match; out of scope.)
- `pnpm --filter @pops/cerebrum-db typecheck/test/build`, `…/inventory-db`, `…/finance-db`, `…/media-db`, `…/food-db`, `…/app-lists-db`, `…/core-db`, `…/db-types`, and `pnpm --filter @pops/api typecheck/test` all pass clean.
- Husky pre-commit + pre-push pass without `--no-verify`.

## Out of Scope

- **Database migrations / drops / rebuilds.** Drizzle-kit picks up the relocated schema files automatically; running migrations to drop the dead FK constraints from existing SQLite files is a Wave 5 / post-prod-verify operational step, not part of this PRD.
- **Renaming any table or column.** Names are preserved verbatim.
- **Changing query patterns at consumer sites.** Only import paths change; no service or router logic moves.
- **Decomposing the non-schema surface of `@pops/db-types`** — `constants.ts`, `embeddings.ts` (the standalone file), `food.ts`, `lists.ts`, `insert-types.ts`, `pillar-registry.ts`. Those stay; a follow-up PRD picks them up after the schema decomposition lands.
- **Application-level FK resolvers** to replace the dropped cross-pillar constraints. Resolution happens via the URI dispatcher and `(media_type, media_id)` soft refs per PR #3198 and ADR-026 — out of scope to add or audit here.
- **Audit H8 cross-pillar code-import remediation.** Tracked separately under the `apps/pops-api` cross-module audit follow-up; this PRD only moves schema files.
- **Retiring `@pops/db-types` outright.** This PRD removes the schema directory; the package's other exports may continue. Final retirement is a follow-up once those surfaces are scoped.

## References

- Audit [#3215](https://github.com/knoxio/pops/issues/3215) — pillar isolation audit; findings H6 + H7.
- [Pillar isolation audit notes — H6 + H7](../../notes/pillar-isolation-audit.md) — finding details + the verified cross-pillar FK inventory.
- [ADR-026](../../../../architecture/adr-026-pillar-architecture.md) — per-pillar SQLite + no cross-pillar FKs; names this decomposition explicitly.
- PR [#3198](https://github.com/knoxio/pops/pull/3198) — debrief mixed-tx redesign; established the `(media_type, media_id)` soft-ref pattern that replaces the cerebrum → media FK.
- PR [#3212](https://github.com/knoxio/pops/pull/3212) — confirmed `media-scores.dimension_id` and similar intra-media references are not cross-pillar and stay as-is.
- [PRD-239](../239-settings-manifest-physical-relocation/README.md) — settings-manifest physical relocation; precedent for the per-pillar relocation arc and the serial-vs-parallel collision lesson.
- [PRD-156](../156-consumer-import-discipline/README.md) — lint rule preventing non-owners from importing `@pops/<pillar>-db`; the cleanup target for cross-module consumers flagged by audit H8.
