# US-03: Relocate finance schemas into `@pops/finance-db` + drop finance → core FKs

> PRD: [PRD-244 — `@pops/db-types` decomposition](README.md)

## Description

As a maintainer dismantling `@pops/db-types/schema/`, I want the finance-owned tables to live in `@pops/finance-db` and to no longer declare schema-level foreign keys into `entities` (a core-owned table), so the finance SQLite file can stand alone.

## Acceptance Criteria

- [ ] The following files move from `packages/db-types/src/schema/` to `packages/finance-db/src/schema/`, alongside their matching `*-row-schemas.ts`:
      `transactions.ts`, `transaction-tag-rules.ts`, `budgets.ts`, `corrections.ts`, `tag-vocabulary.ts`, `wishlist.ts`, `tier-overrides.ts`.
- [ ] The two cross-pillar `.references()` calls listed in PRD-244's H7 table are deleted:
  - `transactions.ts:18` (`entity_id` → `entities.id`) — column stays, `.references(() => entities.id, { onDelete: 'set null' })` clause is removed; the `import { entities } from './entities.js'` is dropped.
  - `transaction-tag-rules.ts:17` (`entity_id` → `entities.id`) — column stays, clause removed, import dropped.
- [ ] The intra-finance FK in `corrections.ts:16` (`entity_id` → `entities.id` — **wait**: this one is `corrections` → `entities`, which audit attributes as `core → core` because both `transactionCorrections` and `entities` are described as intra-core in the audit table) — verify owner before this US lands. If `corrections.ts` is core-owned, it moves under US-07 not here; if it is finance-owned, the FK to core's `entities` is also a cross-pillar FK and gets dropped on the way through. Resolve and document the answer on the US PR.
- [ ] `packages/finance-db/src/schema.ts` exports each relocated table from the new local path. The existing `from '@pops/db-types'` re-export for these tables is removed.
- [ ] `packages/db-types/src/schema/index.ts` re-exports each relocated table from `@pops/finance-db` (transition shim) so existing import sites keep compiling until US-08.
- [ ] Smoke-import test in `finance-db` asserts each relocated table resolves with the expected drizzle `name`.
- [ ] Consumers under `apps/pops-api/src/modules/finance/` (and the misnamed-as-core paths covered by Epic 08a) that import these tables from `@pops/db-types` are repointed at `@pops/finance-db`.
- [ ] No new `as any` / `as unknown as Type` casts; no `eslint-disable` / `ts-ignore` added.
- [ ] `pnpm --filter @pops/finance-db typecheck/test/build`, `pnpm --filter @pops/db-types typecheck/test/build`, and `pnpm --filter @pops/api typecheck/test` all pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- `entity_id` is the description-on-transaction-row reference into core's `entities` table. The FK was already moot at runtime (SQLite-per-pillar); dropping it brings the schema in line with the runtime behaviour. Application-level resolution lives in finance services today and is unchanged.
- `tagVocabularyService` is currently consumed by core modules per audit H8 — repointing those consumers is **out of scope** here (it's a separate audit finding). This US only changes the schema's physical home and the finance-owned import sites.
- Serial-merge order per PRD-244: lands **after** US-07 (core) so the FK target `entities` is settled before this US drops references to it.
