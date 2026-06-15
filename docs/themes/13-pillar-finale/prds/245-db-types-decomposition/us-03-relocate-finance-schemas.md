# US-03: Relocate finance schemas into `@pops/finance-db` + drop finance → core FKs

> PRD: [PRD-245 — `@pops/db-types` decomposition](README.md)

## Description

As a maintainer dismantling `@pops/db-types/schema/`, I want the finance-owned tables to live in `@pops/finance-db` and to no longer declare schema-level foreign keys into `entities` (a core-owned table), so the finance SQLite file can stand alone.

## Acceptance Criteria

- [x] The following files move from `packages/db-types/src/schema/` to `packages/finance-db/src/schema/`, alongside their matching `*-row-schemas.ts`:
      `transactions.ts`, `transaction-tag-rules.ts`, `budgets.ts`, `corrections.ts`, `tag-vocabulary.ts`, `wishlist.ts`, `tier-overrides.ts`.
- [x] The two cross-pillar `.references()` calls listed in PRD-245's H7 table are deleted:
  - `transactions.ts:18` (`entity_id` → `entities.id`) — column stays, `.references(() => entities.id, { onDelete: 'set null' })` clause is removed; the `import { entities } from './entities.js'` is dropped.
  - `transaction-tag-rules.ts:17` (`entity_id` → `entities.id`) — column stays, clause removed, import dropped.
- [x] The intra-finance FK in `corrections.ts:16` (`entity_id` → `entities.id`) is resolved as finance-owned (consistent with the rest of this US's file partition) and the cross-pillar FK clause is dropped on relocation. The `tierOverrides.dimensionId` → `comparisonDimensions.id` FK was also dropped on relocation because moving `tier-overrides.ts` into finance-db re-classified that FK as cross-pillar (finance → media); the dimension id column stays.
- [x] `packages/finance-db/src/schema.ts` exports each relocated table from the new local path. The existing `from '@pops/db-types'` re-export for these tables is removed.
- [x] `packages/db-types/src/schema/index.ts` re-exports each relocated table from `@pops/finance-db` (transition shim) so existing import sites keep compiling until US-08.
- [x] Smoke-import test in `finance-db` asserts each relocated table resolves with the expected drizzle `name`.
- [x] Consumers under `apps/pops-api/src/modules/finance/` (and the misnamed-as-core paths covered by Epic 08a) that import these tables from `@pops/db-types` are repointed at `@pops/finance-db`.
- [x] No new `as any` / `as unknown as Type` casts; no `eslint-disable` / `ts-ignore` added.
- [x] `pnpm --filter @pops/finance-db typecheck/test/build`, `pnpm --filter @pops/db-types typecheck/test/build`, and `pnpm --filter @pops/api typecheck/test` all pass clean.
- [x] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- `entity_id` is the description-on-transaction-row reference into core's `entities` table. The FK was already moot at runtime (SQLite-per-pillar); dropping it brings the schema in line with the runtime behaviour. Application-level resolution lives in finance services today and is unchanged.
- `tagVocabularyService` is currently consumed by core modules per audit H8 — repointing those consumers is **out of scope** here (it's a separate audit finding). This US only changes the schema's physical home and the finance-owned import sites.
- Serial-merge order per PRD-245: lands **after** US-07 (core) so the FK target `entities` is settled before this US drops references to it.
