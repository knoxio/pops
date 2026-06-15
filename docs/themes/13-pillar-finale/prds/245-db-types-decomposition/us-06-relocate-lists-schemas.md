# US-06: Relocate lists schemas into `@pops/app-lists-db`

> PRD: [PRD-245 — `@pops/db-types` decomposition](README.md)

## Description

As a maintainer dismantling `@pops/db-types/schema/`, I want the lists-owned tables (`lists`, `list_items`) to live in `@pops/app-lists-db`. No cross-pillar FKs to drop.

## Acceptance Criteria

- [x] `packages/db-types/src/schema/lists.ts` moves to `packages/app-lists-db/src/schema/lists.ts`, alongside `lists-row-schemas.ts`.
- [x] `packages/app-lists-db/src/schema.ts` exports `lists` and `listItems` from the new local path. The existing `from '@pops/db-types'` re-export at line 10 is removed.
- [x] `packages/db-types/src/schema/index.ts` re-exports `lists` and `listItems` from `@pops/app-lists-db` (transition shim) so existing import sites keep compiling until US-08.
- [x] Smoke-import test in `app-lists-db` asserts both tables resolve with the expected drizzle `name`.
- [x] Consumers under `apps/pops-api/src/modules/lists/` that import these tables from `@pops/db-types` are repointed at `@pops/app-lists-db`.
- [x] No new `as any` / `as unknown as Type` casts; no `eslint-disable` / `ts-ignore` added.
- [x] `pnpm --filter @pops/app-lists-db typecheck/test/build`, `pnpm --filter @pops/db-types typecheck/test/build`, and `pnpm --filter @pops/api typecheck/test` all pass clean.
- [x] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- Smallest US in the PRD — single source file, no cross-pillar references, single consumer module.
- Serial-merge order per PRD-245: late in the sequence is fine. Any time after US-07 works.
