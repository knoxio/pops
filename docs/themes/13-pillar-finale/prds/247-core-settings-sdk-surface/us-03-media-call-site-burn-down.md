# US-03: Flip the 15 media settings call sites to `pillar('core').settings.*`

> PRD: [PRD-247 — core.settings.\* cross-pillar SDK surface](README.md)

## Description

As an `apps/pops-api` media-pillar maintainer, I want every `settingsService.<m>(getCoreDrizzle(), …)` call under `media/{arr,plex,rotation}/` flipped to `await pillar('core').settings.<m>(…)` so the H8 violation entries for these files drop from `.dependency-cruiser-known-violations.json` and the per-pillar SQLite split is unblocked for these 15 files. This US is the consumer side of PRD-247 (US-01 ships the surface); jointly it closes [PRD-246](../246-shell-api-pillar-decoupling/README.md) US-04 Site 8.

## Acceptance Criteria

Per-file (verify the exact list at PR time with `grep -rln "@pops/core-db" apps/pops-api/src/modules/media/{arr,plex,rotation}` — the audit estimate is 15, which matches the current count):

### `arr/`

- [x] `arr/service-settings.ts` — `getSettingOrNull` / `setRawSetting` / `deleteSetting` → SDK. Drop runtime `@pops/core-db` import.
- [x] `arr/download-and-protect.ts` — 2× `getSettingOrNull` → SDK (consider batching as `getMany([quality_profile_id_key, root_folder_path_key])` per Hot Sites note).
- [x] `arr/service.test.ts` — mocks updated to mock the SDK module, not `@pops/core-db`.

### `plex/`

- [x] `plex/service.ts` — 7+ `getSettingOrNull` calls. Hot paths (`getPlexClient`, `getPlexSectionIds`, `getSyncStatus`) use `getMany`. `ensureSetting` (encryption seed + client identifier) → `pillar('core').settings.ensure(...)`.
- [x] `plex/scheduler.ts` — scheduler-key reads/writes/deletes. `getPersistedSchedulerState` uses `getMany`.
- [x] `plex/router-auth.ts` — `setRawSetting` (token + username) + `deleteSetting` → SDK.
- [x] `plex/router-connection.ts` — `getSettingOrNull` (token) + `setRawSetting` (url) → SDK.
- [x] `plex/service.test.ts`, `plex/scheduler.test.ts`, `plex/plex-auth.test.ts` — mocks updated.

### `rotation/`

- [ ] `rotation/scheduler.ts` — `getSettingOrNull` / `setRawSetting` / `deleteSetting` → SDK.
- [x] `rotation/addition-gating.ts` — `getSettingOrNull` → SDK.
- [x] `rotation/download-candidate.ts` — 2× `getSettingOrNull` → SDK (candidate for `getMany`).
- [ ] `rotation/rotation-config-router.ts` — `getSettingOrNull` per-def loop + `setBulkSettings` (transactional write) → `getMany` (one call replaces the loop) + `setMany`.
- [x] `rotation/candidate-queue.test.ts` — mocks updated.

### Cross-cutting

- [x] `.dependency-cruiser-known-violations.json` shrinks by the entries this US closes. CI must stay green commit-to-commit; do not batch a broken intermediate.
- [x] Each affected file has no runtime `@pops/core-db` import after the flip. Type-only `import type { SettingsKey } from '@pops/core-db'` is allowed (the gate rule distinguishes runtime).
- [x] Hot Plex paths (`getPlexClient`, `getPlexSectionIds`, `getSyncStatus`, scheduler resume) issue exactly **one** SDK call per code path, not N.
- [x] `pnpm --filter @pops/pops-api typecheck/test/build` passes clean after each per-file (or per-dir) PR.
- [x] Monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` pass clean.
- [x] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- US-03 is the consumer side; US-01 is the surface side. US-03 blocks on US-01 landing first.
- Per-dir PRs are encouraged: one PR for `arr/`, one for `plex/`, one for `rotation/`. Each shrinks the allow-list by its slice; intermediate states are valid as long as CI stays green.
- arr+rotation slice landed first; plex slice (this US) closes US-03. `rotation/scheduler.ts` and `rotation/rotation-config-router.ts` remain as a separate follow-up (outside US-03 scope; tracked via standalone tickets).
- The plex cascade made `getPlexClient` / `getPlexClientId` / `getPlexToken` / `getPlexUrl` / `getPlexUsername` / `getPlexSectionIds` / `savePlexSectionIds` / `encryptToken` / `decryptToken` / `getSyncStatus` async, plus `requirePlexClient` in `router-helpers.ts`. Updates cascaded through `jobs/handlers/sync.ts`, `media/discovery/plex-service.ts`, `media/library/router.ts`, `media/watchlist/router.ts` + `media/watchlist/plex-push.ts`, `media/plex/router-{connection,scheduler,sync,auth}.ts`, `media/plex/sync-{discover-watches,discover-check,discover-graphql,watchlist}.ts`, `media/rotation/plex-{watchlist,friends}-source.ts`, `media/rotation/rotation-sources-router.ts`, and the scheduler auto-resume hook in `src/index.ts`. Tests updated: `media/plex/{service,scheduler,plex-auth}.test.ts`, `media/discovery/plex-service.test.ts`, `media/plex/sync-discover-watches.test.ts`, `media/rotation/plex-friends-source.test.ts`, and `media/library/library.test.ts` (SDK mock added).
- The `getMany` batching on Plex paths is the leverage point. Naive 1:1 ports cost 3–4× p99 on hot paths. Reviewer must reject PRs that port a multi-setting read as N sequential `await pillar('core').settings.get(...)` calls.
- Test mocks flip from mocking `@pops/core-db` to mocking the SDK module per the [server-pillar-sdk-consumer-pattern](../../notes/server-pillar-sdk-consumer-pattern.md) doc (PRD-247 US-02).
- After this US lands, [PRD-246](../246-shell-api-pillar-decoupling/README.md) US-04 Site 8 closes. Update PRD-246's tracking table in the same PR (or referenced commit).
