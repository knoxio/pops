# US-04: Relocate media schemas into `@pops/media-db`

> PRD: [PRD-245 — `@pops/db-types` decomposition](README.md)

## Description

As a maintainer dismantling `@pops/db-types/schema/`, I want the media-owned tables to live in `@pops/media-db`, so the media SQLite file fully owns its schema source. No cross-pillar FKs to drop — every media FK is intra-media (audit H7 + PR #3212).

## Acceptance Criteria

- [x] The following files move from `packages/db-types/src/schema/` to `packages/media-db/src/schema/`, alongside their matching `*-row-schemas.ts`:
      `comparison-dimensions.ts`, `comparison-skip-cooloffs.ts`, `comparison-staleness.ts`, `comparisons.ts`, `dismissed-discover.ts`, `media-scores.ts`, `media-watchlist.ts`, `movies.ts`, `rotation-candidates.ts`, `rotation-exclusions.ts`, `rotation-log.ts`, `rotation-sources.ts`, `seasons.ts`, `shelf-impressions.ts`, `sync-logs.ts`, `sync-job-results.ts`, `tv-shows.ts`, `watch-history.ts`.
- [x] `episodes.ts` ownership resolved: media-owned. Moved with this US (the season/episode hierarchy is what `watch-history` references; cerebrum's `episodes` use was via the same drizzle table).
- [x] All intra-media FKs are preserved (e.g. `media-scores.ts:14` → `comparisonDimensions.id`, rotation table internal FKs, watch-history FKs). The audit verified these are not cross-pillar.
- [x] `packages/media-db/src/schema.ts` exports each relocated table from the new local path. The existing `from '@pops/db-types'` re-export for these tables is removed.
- [x] `packages/db-types/src/schema/index.ts` re-exports each relocated table from `@pops/media-db` (transition shim) so existing import sites keep compiling until US-08.
- [x] Smoke-import test in `media-db` asserts each relocated table resolves with the expected drizzle `name`.
- [x] Consumers under `apps/pops-api/src/modules/media/` that import these tables from `@pops/db-types` are repointed at `@pops/media-db`.
- [x] No new `as any` / `as unknown as Type` casts; no `eslint-disable` / `ts-ignore` added.
- [x] `pnpm --filter @pops/media-db typecheck/test/build`, `pnpm --filter @pops/db-types typecheck/test/build`, and `pnpm --filter @pops/api typecheck/test` all pass clean.
- [x] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- This US is the FK-target settling step for US-01 — cerebrum drops its references into `watchHistory`, `comparisonDimensions`, `comparisons`. Landing media first means cerebrum's drops have a stable target.
- No new application logic. Pure relocation.
- Serial-merge order per PRD-245: lands **after** US-07 (core) and **before** US-01 (cerebrum).
