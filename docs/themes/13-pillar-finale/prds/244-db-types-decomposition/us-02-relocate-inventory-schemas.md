# US-02: Relocate inventory schemas into `@pops/inventory-db` + drop inventory → finance / core FKs

> PRD: [PRD-244 — `@pops/db-types` decomposition](README.md)

## Description

As a maintainer dismantling `@pops/db-types/schema/`, I want the inventory-owned tables to live in `@pops/inventory-db` and to no longer declare schema-level foreign keys into finance or core, so the inventory SQLite file can stand alone.

## Acceptance Criteria

- [ ] The following files move from `packages/db-types/src/schema/` to `packages/inventory-db/src/schema/`, alongside their matching `*-row-schemas.ts`:
      `inventory.ts`, `item-connections.ts`, `item-fixture-connections.ts`, `item-documents.ts`, `item-photos.ts`, `item-uploaded-files.ts`, `locations.ts`, `fixtures.ts`.
- [ ] The two cross-pillar `.references()` calls in `inventory.ts` are deleted:
  - `inventory.ts:29` (`purchase_transaction_id` → `transactions.id`) — column stays, `.references(() => transactions.id, { onDelete: 'set null' })` clause is removed; the `import { transactions } from './transactions.js'` is dropped.
  - `inventory.ts:32` (`purchased_from_id` → `entities.id`) — column stays, clause removed, `import { entities } from './entities.js'` dropped.
- [ ] The intra-inventory FK at `inventory.ts:43-45` (`location_id` → `locations.id`) is preserved — both tables move together and stay in the same `-db` package.
- [ ] `packages/inventory-db/src/schema.ts` exports each relocated table from the new local path. The existing `from '@pops/db-types'` re-export for these tables is removed.
- [ ] `packages/db-types/src/schema/index.ts` re-exports each relocated table from `@pops/inventory-db` (transition shim) so existing import sites keep compiling until US-08.
- [ ] Smoke-import test in `inventory-db` asserts each relocated table resolves with the expected drizzle `name`.
- [ ] Consumers under `apps/pops-api/src/modules/inventory/` that import these tables from `@pops/db-types` are repointed at `@pops/inventory-db`.
- [ ] No new `as any` / `as unknown as Type` casts; no `eslint-disable` / `ts-ignore` added.
- [ ] `pnpm --filter @pops/inventory-db typecheck/test/build`, `pnpm --filter @pops/db-types typecheck/test/build`, and `pnpm --filter @pops/api typecheck/test` all pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- `purchase_transaction_id` and `purchased_from_id` were already moot at runtime — SQLite-per-pillar cannot enforce a FK into a database file on a different disk. Dropping the schema declaration brings the source of truth in line with the runtime behaviour. Application-level resolution (loading the entity / transaction) happens via the URI dispatcher and is unchanged.
- The `onDelete: 'set null'` semantics disappear with the FK. Inventory rows with a dangling `purchased_from_id` simply keep the dangling id; resolution-time lookup decides what to do. Verify that no consumer of `home_inventory` relied on the cascading `set null` for correctness — none was identified during scoping, but flag any new finding on the PR.
- Serial-merge order per PRD-244: lands **after** US-07 (core) and US-03 (finance), since this US drops references to tables owned by those pillars.
