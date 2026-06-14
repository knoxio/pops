# US-01: Relocate cerebrum schemas into `@pops/cerebrum-db` + drop cerebrum → media FKs

> PRD: [PRD-244 — `@pops/db-types` decomposition](README.md)

## Description

As a maintainer dismantling `@pops/db-types/schema/`, I want the cerebrum-owned tables to live in `@pops/cerebrum-db` and to no longer declare schema-level foreign keys into the media pillar, so the cerebrum SQLite file can stand alone and the next per-pillar US can land without conflicting with stale cerebrum FKs.

## Acceptance Criteria

- [ ] The following files move from `packages/db-types/src/schema/` to `packages/cerebrum-db/src/schema/`, alongside their matching `*-row-schemas.ts`:
      `debrief-sessions.ts`, `debrief-status.ts`, `debrief-results.ts`, `engrams.ts`, `glia.ts`, `ego.ts`, `episodes.ts` (cerebrum-side if a split is needed; otherwise the file stays where the audit attributes it), `plexus.ts`, `nudge-log.ts`, `reflex-executions.ts`, `core/embeddings.ts`.
- [ ] The four cross-pillar `.references()` calls listed in PRD-244's H7 table are deleted:
  - `debrief-sessions.ts:26` (`watch_history_id` → `watchHistory.id`) — column stays, `.references(() => watchHistory.id)` clause is removed; the `import { watchHistory } from './watch-history.js'` is dropped.
  - `debrief-status.ts:14` (`dimension_id` → `comparisonDimensions.id`) — column stays, clause removed, import dropped.
  - `debrief-results.ts:15` (`dimension_id` → `comparisonDimensions.id`) — column stays, clause removed, import dropped.
  - `debrief-results.ts:16` (`comparison_id` → `comparisons.id`) — column stays, clause removed, import dropped.
- [ ] `packages/cerebrum-db/src/schema.ts` exports each relocated table from the new local path. The existing `from '@pops/db-types'` re-export for these tables is removed.
- [ ] `packages/db-types/src/schema/index.ts` re-exports each relocated table from `@pops/cerebrum-db` (transition shim) so existing `from '@pops/db-types'` import sites keep compiling until US-08 removes the shim.
- [ ] Smoke-import test in `cerebrum-db` asserts each relocated table resolves with the expected drizzle `name` (e.g. `debriefSessions[Symbol.for('drizzle:Name')] === 'debrief_sessions'`).
- [ ] Consumers under `apps/pops-api/src/modules/cerebrum/` that import these tables from `@pops/db-types` are repointed at `@pops/cerebrum-db`.
- [ ] No new `as any` / `as unknown as Type` casts; no `eslint-disable` / `ts-ignore` added.
- [ ] `pnpm --filter @pops/cerebrum-db typecheck/test/build`, `pnpm --filter @pops/db-types typecheck/test/build`, and `pnpm --filter @pops/api typecheck/test` all pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- `(media_type, media_id)` denormalisation already exists on `debrief_sessions` and `debrief_status` per PR [#3198](https://github.com/knoxio/pops/pull/3198), so the FK drop is a clean removal — no new column or backfill needed in this US.
- Cross-pillar resolution of `watch_history_id`, `dimension_id`, `comparison_id` continues to happen in application code via the URI dispatcher, per ADR-026 and PR #3198. Not part of this US.
- Serial-merge order per PRD-244: this US lands **after** US-07 (core) and US-04 (media). US-07 first because shared `core/` files relocate together; US-04 before this one so the FK targets (`watchHistory`, `comparisons`, `comparisonDimensions`) have settled at their final home before this US drops references to them.
