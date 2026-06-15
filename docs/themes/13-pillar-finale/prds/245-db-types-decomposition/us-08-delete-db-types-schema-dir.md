# US-08: Delete `packages/db-types/src/schema/` and finalise the decomposition

> PRD: [PRD-245 — `@pops/db-types` decomposition](README.md)

## Description

As a maintainer finishing PRD-245, I want the `@pops/db-types/schema/` directory deleted and drizzle-kit pointed at the per-pillar `-db` packages, so the audit H6 finding is fully closed and `@pops/db-types` no longer hosts any table definition.

## Acceptance Criteria

- [x] `packages/db-types/src/schema/` directory is deleted entirely (after confirming every table now lives in its owning `-db` package per US-01 … US-07).
- [x] `packages/db-types/src/index.ts` removes every schema-related re-export. Per-pillar type shims (`cerebrum-types`, `core-types`, `inventory-types`, `media-types`, `food-types`, `lists`), the `insert-types` aggregator, and the `pillar-registry` shim are deleted; their `Row`/`Insert` aliases now live in the owning pillar `-db` package. `constants` stays — it is the only cross-pillar surface and is frontend-safe.
- [x] Drizzle-kit's schema glob already points at each `-db` package's `src/schema/` directory (US-01..US-07). Per-pillar `drizzle:check` invocations report no schema drift.
- [x] `grep -rn "from '@pops/db-types'" packages apps` returns only three matches, all importing `ENTITY_TYPES` / `INVENTORY_CONDITIONS` from the surviving `constants` surface.
- [x] For every workspace package that previously depended on `@pops/db-types` solely for its schema re-exports, the `package.json` `dependencies` entry is removed (`@pops/api`, `@pops/finance-api`, `@pops/inventory-api`, `@pops/app-food`, `@pops/app-lists`, `@pops/app-food-db`, `@pops/lists-db`). Frontend packages that still need the constants (`@pops/app-finance`, `@pops/app-inventory`) keep the dep.
- [x] `pnpm --filter @pops/db-types typecheck/build` passes, and so does the receiving-package matrix from US-01 … US-07 (`@pops/cerebrum-db`, `@pops/inventory-db`, `@pops/finance-db`, `@pops/media-db`, `@pops/food-db`, `@pops/app-food-db`, `@pops/app-lists-db`, `@pops/core-db`) plus `pnpm --filter @pops/api typecheck/test` (4899/4899 tests pass) and `pnpm --filter @pops/shell typecheck/test/build` (526/526 tests pass).
- [x] Audit issue [#3215](https://github.com/knoxio/pops/issues/3215) findings H6 and H7 are marked Done by the PR description.
- [x] No new `as any` / `as unknown as Type` casts; no `eslint-disable` / `ts-ignore` added.
- [x] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- This US is blocked by US-01 … US-07. Do not start before all seven have merged to `main`.
- Confirm before deletion: `git grep "packages/db-types/src/schema"` returns zero hits outside the directory being deleted (drizzle-kit config, scripts, README, etc. should all be repointed already).
- The `@pops/db-types` package itself stays alive; its remaining surface is the subject of a follow-up scoping pass.
