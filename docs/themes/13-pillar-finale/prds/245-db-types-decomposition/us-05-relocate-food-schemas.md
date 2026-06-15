# US-05: Relocate food schemas into `@pops/food-db` / `@pops/app-food-db`

> PRD: [PRD-245 — `@pops/db-types` decomposition](README.md)

## Description

As a maintainer dismantling `@pops/db-types/schema/`, I want the food-owned tables to live in the food `-db` package(s), so the food SQLite file fully owns its schema source. No cross-pillar FKs to drop.

## Acceptance Criteria

- [x] The following files move from `packages/db-types/src/schema/` to `packages/food-db/src/schema/` (or `packages/app-food-db/src/schema/` for tables the existing food split attributes there — `app-food-db` already imports from `@pops/db-types` for `IngestSourceKind`, `aiInferenceLog`, etc.; the per-file split mirrors the existing layout):
      `food.ts`, `food-batches.ts`, `food-compile.ts`, `food-conversions.ts`, `food-ingest-sources.ts`, `food-ingredients.ts`, `food-plan.ts`, `food-recipes.ts`, `food-rejections.ts`, `food-substitutions.ts`, alongside their matching `*-row-schemas.ts`.
- [x] If a file genuinely splits across both food packages (e.g. some recipe tables live in `app-food-db`'s queries surface today), document the per-file home on the US PR before moving.
- [x] All intra-food FKs are preserved.
- [x] `packages/food-db/src/schema.ts` (and `packages/app-food-db/src/schema.ts` where applicable) export each relocated table from the new local path. The existing `from '@pops/db-types'` re-exports for these tables are removed.
- [x] `packages/db-types/src/schema/index.ts` re-exports each relocated table from the food `-db` package (transition shim) so existing import sites keep compiling until US-08.
- [x] Smoke-import test in the receiving package asserts each relocated table resolves with the expected drizzle `name`.
- [x] Consumers under `apps/pops-api/src/modules/food/` that import these tables from `@pops/db-types` are repointed at the food `-db` package.
- [x] No new `as any` / `as unknown as Type` casts; no `eslint-disable` / `ts-ignore` added.
- [x] `pnpm --filter @pops/food-db typecheck/test/build`, `pnpm --filter @pops/app-food-db typecheck/test/build`, `pnpm --filter @pops/db-types typecheck/test/build`, and `pnpm --filter @pops/api typecheck/test` all pass clean.
- [x] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- `aiInferenceLog` and `IngestSourceKind` are AI / core surfaces consumed by food; they stay in their owner's package (core US-07) and food keeps importing them from there.
- Serial-merge order per PRD-245: order relative to other USs is flexible since food does not cross-pillar-FK anything; safest is **after** US-07 (core) since `aiInferenceLog` references move with core.
