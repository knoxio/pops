# US-01: Mount `settings.*` on `pops-core-api`'s `coreRouter`

> PRD: [PRD-247 — core.settings.\* cross-pillar SDK surface](README.md)

## Description

As a cross-pillar caller, I want `pops-core-api` to expose `core.settings.{get, set, ensure, delete, getMany, setMany}` with zod-validated inputs / outputs identical to the in-monolith shape so that the typed `pillar<CoreRouter>('core').settings.*` proxy resolves to a real wire endpoint. The in-monolith router's `getBulk` / `setBulk` rename to `getMany` / `setMany` in the same change so both surfaces present one map.

## Acceptance Criteria

- [ ] `apps/pops-core-api/src/modules/settings/router.ts` exists and mounts the six procedures:
  - [x] `get({ key })` → `{ data: Setting | null }` _(contract schema pinned in `@pops/core-contract`)_
  - [x] `set({ key, value })` → `{ data: Setting, message: string }` _(contract schema pinned)_
  - [x] `ensure({ key, value })` → `{ data: Setting }` (upsert-return) _(contract schema pinned)_
  - [x] `delete({ key })` → `{ message: string }` _(contract schema pinned)_
  - [x] `getMany({ keys: string[] })` → `{ settings: Record<string, string> }` (missing keys omitted) _(contract schema pinned)_
  - [x] `setMany({ entries: { key, value }[] })` → `{ settings: Record<string, string> }` (transactional) _(contract schema pinned)_
- [ ] `apps/pops-core-api/src/router.ts` mounts `settings: settingsRouter` under `coreRouter`. Procedure paths are `core.settings.*`.
- [ ] The router reuses `@pops/core-db`'s `settingsService` against `getCoreDrizzle()` resolved from the app context. No table-shape duplication.
- [ ] `apps/pops-api/src/modules/core/settings/router.ts` is updated in the same PR:
  - [ ] `getBulk` → `getMany` (procedure rename + zod alias kept for one minor version if any consumer still depends on the old path; document in PR body).
  - [ ] `setBulk` → `setMany`.
  - [ ] `ensure` newly exposed (binds to existing `service.ensureSetting`).
  - [ ] Tests under `apps/pops-api/src/modules/core/settings/settings.test.ts` updated to new names.
- [ ] Contract package (`packages/contracts-core/...`) regenerated so `pillar<CoreRouter>('core').settings.*` resolves at the type level.
- [ ] `pnpm --filter @pops/pops-core-api typecheck/test/build` passes clean.
- [ ] `pnpm --filter @pops/pops-api typecheck/test/build` passes clean.
- [ ] Monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- Reuse the existing zod schemas (`SettingSchema`, `SettingListSchema`) from `apps/pops-api/src/modules/core/settings/types.ts` — promote them into a shared types module if they're not already there (the contract-generator picks up wherever they live).
- The rename `getBulk` → `getMany` is **mechanical**. If any callsite outside `apps/pops-api/src/modules/core/settings/` references the procedure path string (`'core.settings.getBulk'`), update them in the same PR. `grep -rn "'core.settings.getBulk'" .` before merging.
- `ensure` is exposed not because PRD-246 US-04 Site 8 demands it but because `plex/service.ts` calls `ensureSetting` directly today (two call sites: encryption seed, client identifier). Exposing it now means US-03 can flip those without a follow-up PRD.
- The wire-shape's transport, service-account auth, and discovery-cache are inherited from `packages/pillar-sdk/src/server/factory.ts` — no changes to that layer.
