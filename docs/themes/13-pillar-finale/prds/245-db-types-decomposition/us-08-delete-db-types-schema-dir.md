# US-08: Delete `packages/db-types/src/schema/` and finalise the decomposition

> PRD: [PRD-245 — `@pops/db-types` decomposition](README.md)

## Description

As a maintainer finishing PRD-245, I want the `@pops/db-types/schema/` directory deleted and drizzle-kit pointed at the per-pillar `-db` packages, so the audit H6 finding is fully closed and `@pops/db-types` no longer hosts any table definition.

## Acceptance Criteria

- [ ] `packages/db-types/src/schema/` directory is deleted entirely (after confirming every table now lives in its owning `-db` package per US-01 … US-07).
- [ ] `packages/db-types/src/index.ts` removes every schema-related re-export. The remaining surface (`constants`, `embeddings` standalone file, `food` shim, `lists` shim, `insert-types`, `pillar-registry`) stays — out of scope for this PRD.
- [ ] Drizzle-kit's schema glob is repointed at each `-db` package's `src/schema/` directory. `pnpm drizzle:check` (or the equivalent migration-diff command) reports no schema drift.
- [ ] `grep -rn "from '@pops/db-types'" packages apps` under `src/` returns zero matches against any of the relocated table names. (Non-schema surface matches — `IngestSourceKind`, `aiInferenceLog`'s constants, etc. — are out of scope.)
- [ ] For every workspace package that previously depended on `@pops/db-types` solely for its schema re-exports, the `package.json` `dependencies` entry is removed. Packages that still need `@pops/db-types` for non-schema surfaces keep the dep.
- [ ] `pnpm --filter @pops/db-types typecheck/test/build` passes, and so does the receiving-package matrix from US-01 … US-07 (`@pops/cerebrum-db`, `@pops/inventory-db`, `@pops/finance-db`, `@pops/media-db`, `@pops/food-db`, `@pops/app-food-db`, `@pops/app-lists-db`, `@pops/core-db`) plus `pnpm --filter @pops/api typecheck/test`.
- [ ] Audit issue [#3215](https://github.com/knoxio/pops/issues/3215) findings H6 and H7 are marked Done by the PR description; the audit notes file gets a status update.
- [ ] No new `as any` / `as unknown as Type` casts; no `eslint-disable` / `ts-ignore` added.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- This US is blocked by US-01 … US-07. Do not start before all seven have merged to `main`.
- Confirm before deletion: `git grep "packages/db-types/src/schema"` returns zero hits outside the directory being deleted (drizzle-kit config, scripts, README, etc. should all be repointed already).
- The `@pops/db-types` package itself stays alive; its remaining surface is the subject of a follow-up scoping pass.
