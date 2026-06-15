# PRD-247: `core.settings.*` cross-pillar SDK surface (unblock media → core settings burn-down)

> Epic: [Cross-pillar code placement](../../epics/08b-cross-pillar-code-placement.md)
>
> Status: **Done** — US-01 core-api router mounted; US-04 integration test landed (`apps/pops-core-api/src/__tests__/core-settings-sdk-itest.test.ts`); US-02 pattern doc landed; US-03 burn-down complete (arr+rotation slice landed in #3302; plex slice closes US-03 and PRD-247). Direct unblock for [PRD-246](../246-shell-api-pillar-decoupling/README.md) US-04 Site 8 (media files reading `@pops/core-db` directly).

## Overview

[PRD-246](../246-shell-api-pillar-decoupling/README.md) US-04 Site 8 is the single largest entry on the H8 cross-pillar burn-down: ~15 files under `apps/pops-api/src/modules/media/{arr,plex,rotation}/` reach into `@pops/core-db` to read and write settings via `settingsService.{getSettingOrNull, setRawSetting, ensureSetting, deleteSetting, getBulkSettings, setBulkSettings}`. PRD-246's own "Out of Scope" forbids introducing the SDK shape needed to flip them: _"No new SDK type machinery."_ Today `pops-core-api`'s root router exposes only `registry` and `serviceAccounts` — no `settings.*`.

PRD-247 is the scoping PRD that defines the `pillar('core').settings.*` server-side surface so that PRD-246 US-04 Site 8 has somewhere to call. The surface mirrors the existing `apps/pops-api/src/modules/core/settings/router.ts` shape (which already lives inside the pops-api monolith) but published from `pops-core-api` so cross-pillar callers go through HTTP + service-account auth, not a direct table read.

The `getMany` shape is **non-negotiable and designed-in from US-01**. `plex/service.ts` and `plex/scheduler.ts` batch-read multiple settings per call (`PLEX_TOKEN` + `PLEX_USERNAME` + `PLEX_URL`; `PLEX_MOVIE_SECTION_ID` + `PLEX_TV_SECTION_ID`; etc.). Porting those naively as N round-trips would regress p99 latency on hot Plex sync paths. The bulk read is in the surface from day one.

PRD-247 also establishes the **first server-to-server pillar SDK consumer pattern in `pops-api`**: today the `pillar()` proxy is used client-side from `app-*` packages. The server-side `pillar()` shape exists (`packages/pillar-sdk/src/server/factory.ts`) but no in-monolith consumer drives the conventions. The 15 media call sites are the first; PRD-247 fixes the shape conventions (async signature, `PillarCallError` handling, error surface) so PRD-248 and PRD-249 inherit them.

## Background

The settings module sits inside `apps/pops-api/src/modules/core/settings/` and is consumed in two ways today:

- **In-pillar consumers** (`core/ai-usage`, `core/embeddings` orchestrator, etc.) call `service.getSettingOrNull(...)` directly. Same `core` pillar, same SQLite handle — no boundary.
- **Cross-pillar consumers** (15 files under `media/{arr,plex,rotation}`) import `settingsService` from `@pops/core-db` and pass `getCoreDrizzle()`. This is the H8 violation.

The audit's note on Site 8 ([`us-04-cross-pillar-import-burn-down.md`](../246-shell-api-pillar-decoupling/us-04-cross-pillar-import-burn-down.md#site-8--media--core-settings-reads-arr-plex-rotation-10-files)) proposes `pillar('core').settings.get(...)` as the replacement shape but does not specify it; the matching `pops-core-api` endpoint does not yet exist.

Surface inventory of the 15 call sites (verified by `grep -rn "settingsService\." apps/pops-api/src/modules/media/{arr,plex,rotation}`):

| Method                        | Call sites | Notes                                                                                 |
| ----------------------------- | ---------: | ------------------------------------------------------------------------------------- |
| `getSettingOrNull(db, key)`   |        ~18 | Read one setting. Most common shape across `arr`, `plex`, `rotation`.                 |
| `setRawSetting(db, key, val)` |         ~6 | Write one setting.                                                                    |
| `ensureSetting(db, key, val)` |         ~2 | Upsert-and-return; used by `plex/service.ts` for encryption seed + client identifier. |
| `deleteSetting(db, key)`      |         ~3 | Used by `arr/service-settings.ts`, `plex/scheduler.ts`, `plex/router-auth.ts`.        |
| `setBulkSettings(db, [...])`  |          1 | `rotation/rotation-config-router.ts` writes multiple settings transactionally.        |
| **`getBulkSettings`-shape**   |          — | Currently expressed as N `getSettingOrNull` calls on hot Plex paths (see Hot Sites).  |

### Hot sites that force `getMany`

`apps/pops-api/src/modules/media/plex/service.ts` reads 3–4 settings per call inside `connectionStatus` / `loadSavedSelections` / `getPlexClient`. `plex/scheduler.ts` reads scheduler-key triples per polling tick. With one HTTP round-trip per `getSettingOrNull`, the network amplifier is 3–4× per code path. The `getMany([keys])` shape collapses that into a single call.

### What ships today inside the monolith (the reference shape)

```text
core.settings.list({ search?, limit?, offset? })   →  paginated list
core.settings.get({ key })                          →  one row | null
core.settings.set({ key, value })                   →  upsert
core.settings.delete({ key })                       →  delete
core.settings.getBulk({ keys: string[] })           →  Record<key, value>  (missing keys omitted)
core.settings.setBulk({ entries: { key, value }[] })→ Record<key, value> (transactional)
```

PRD-247 promotes these procedures into `pops-core-api`'s `coreRouter` and exposes them via the typed proxy. `list` is **not** required by US-04 Site 8 and stays in pops-api only.

## Surface

| Surface                                                                                       | Change                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/pops-core-api/src/modules/settings/router.ts` (new)                                     | Mount `settings.{get, set, ensure, delete, getMany, setMany}` on the existing `coreRouter`. Implementation reuses `@pops/core-db`'s `settingsService` (the shared service layer the monolith calls today) with `getCoreDrizzle()` resolved from the core-api app context. No table-shape duplication.                                                                     |
| `apps/pops-core-api/src/router.ts`                                                            | `coreRouter` adds `settings: settingsRouter`. Procedure paths become `core.settings.*` — identical to the in-monolith path so existing `caller.core.settings.*` test-utility code keeps working.                                                                                                                                                                          |
| `packages/contracts-core/src/...` (per [PRD-153](../153-contract-package-scaffold/README.md)) | Generated contract package picks up the new procedures. The typed proxy `pillar<CoreRouter>('core').settings.*` exposes the surface to cross-pillar callers.                                                                                                                                                                                                              |
| `apps/pops-api/src/modules/core/settings/router.ts`                                           | The in-monolith router stays — it serves single-pillar callers and the dispatcher target for `core.settings.*` per existing nginx routing. The two surfaces share the same `service.ts` and the same backing table. The new procedures (`ensure`, `getMany`, `setMany`) are added to the monolith router in lockstep so callers that hit either binding see the same map. |
| `packages/pillar-sdk/src/server/index.ts`                                                     | No new code. The existing server-side `pillar()` from `factory.ts` is the consumer-side seam. PRD-247 only documents the shape conventions (see Business Rules) so PRD-248 and PRD-249 inherit them.                                                                                                                                                                      |
| 15 media files under `apps/pops-api/src/modules/media/{arr,plex,rotation}/`                   | Flip `settingsService.<m>(getCoreDrizzle(), …)` → `await pillar('core').settings.<m>(…)`. Each file drops its `@pops/core-db` import (or trims it to `SETTINGS_KEYS` type-only). The matching `.dependency-cruiser-known-violations.json` entries land in the same PR.                                                                                                    |

### Wire shape

The procedures are zod-validated identically to the monolith equivalents. Three design points:

- **`getMany` returns a `Record<string, string>`** — missing keys are omitted (not `null`-valued), matching `getBulkSettings`'s existing shape. The caller iterates keys it asked for and treats absence as "not set".
- **`ensure` returns the persisted row** — upsert semantics: if no row exists, insert with the provided value; if a row exists, return it unchanged. The caller cannot tell from the return value which branch ran (matching today's `ensureSetting`).
- **`setMany` is transactional** — all-or-nothing. If any write fails, none persists. Matches `setBulkSettings`'s existing semantics.

### Naming reconciliation

The audit prose ("PRD-246 US-04 blockers") uses these names: `getOrNull, set, ensure, delete, getMany`. The existing in-monolith router uses these: `get, set, delete, getBulk, setBulk` (no `ensure` exposed). PRD-247 settles on the audit names (cleaner; matches consumer expectation) and renames the monolith router's `getBulk`/`setBulk` to `getMany`/`setMany` in the same PR (US-01). `get` keeps its name; the underlying service stays `getSettingOrNull` (returns nullable). `ensure` is newly exposed but the underlying `ensureSetting` already exists in `service.ts`.

## Business Rules

### Surface conventions

- **All cross-pillar SDK calls are `async`.** The server-side `pillar()` proxy makes a network hop (HTTP to `pops-core-api`). Even when both pillars run in the same process during local dev, the proxy still serialises through the transport. Call sites that today do `const x = settingsService.getSettingOrNull(...)` synchronously become `const x = await pillar('core').settings.get(...)`. Functions wrapping these reads become `async`.
- **`PillarCallError` discrimination at the call site.** The `pillar()` proxy returns the result directly on success and throws `PillarCallError` on transport / typed failure, matching the client-side convention from [PRD-242 US-05](../242-dynamic-approuter/us-05-developer-doc-typed-vs-calldynamic.md). Server-side call sites wrap reads in `try { await pillar('core').settings.get(...) } catch (err) { if (err instanceof PillarCallError) … }` when partial failure matters; for hot read paths (Plex sync) the `pillar-unavailable` discriminant is treated as a transient error and surfaced upward.
- **Service-account auth.** The server-side `pillar()` requires `POPS_INTERNAL_API_KEY` (see `factory.ts:43`). PRD-247's US-01 verifies that pops-api boots with the env var set and fails closed otherwise. CI fixtures provision a fixture key.
- **No new transport.** The existing `InternalBaseUrlTransport` (configured per env) routes `pillar('core')` to `http://pops-core-api:<port>` in container land and to the in-process dispatcher in local dev. PRD-247 does not introduce a new transport mode.
- **Caching the discovery handle.** The server-side `pillar()` caches per-`pillarId` handles inside the process (`factory.ts:42`). Hot loops calling `pillar('core').settings.get(...)` do one discovery fetch per TTL window; the wire call is per-invocation.

### `getMany` semantics

- **Designed-in, not bolted on.** PRD-247 US-01 lands `getMany` and `setMany` in the same PR as the single-key procedures. The hot Plex paths flip directly to `getMany` in US-03; a naive `for (const key of keys) await pillar('core').settings.get(...)` port is **not** acceptable.
- **Order-independent.** `getMany({ keys })` returns a `Record<string, string>`. The caller indexes by key; the response has no ordering contract.
- **Missing keys are omitted.** Matches `getBulkSettings`. No `null`-valued entries. The caller does `result[key] ?? defaultValue` to handle absence.
- **Empty `keys` returns `{}`.** Not an error. Matches `getBulkSettings`.

### Burn-down boundary

- **PRD-247 ships the surface; PRD-246 US-04 consumes it.** The 15 call-site flips live under US-03 here, but the H8 allow-list shrink is the joint outcome with PRD-246 US-04 Site 8. The split is purely tracking: one PRD owns "the SDK exists", the other owns "the violations are gone".
- **`.dependency-cruiser-known-violations.json` is touched only by the consumer PR.** PRD-247's surface PRs do not churn the allow-list. Only US-03 (the call-site burn-down) removes entries.
- **Type-only imports of `SETTINGS_KEYS` are allowed.** The `SETTINGS_KEYS` enum lives in `@pops/core-db` and is the source of truth for key strings. Media call sites continue to import it `type`-only after the cutover; this is not an H8 violation per the dependency-cruiser rules (the gate distinguishes runtime from type-only imports).

## Edge Cases

| Case                                                                         | Behaviour                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pops-core-api` is unavailable (registry returns no endpoint, or HTTP fails) | `pillar('core').settings.get(...)` throws `PillarCallError` with `kind: 'pillar-unavailable'`. Hot Plex paths surface the error upward; no fallback to a direct `@pops/core-db` read (that would re-introduce the H8 violation). Operators see a degraded Plex sync; the in-process backfill plan is out of scope. |
| Two callers race a `set` + `get` on the same key                             | Last-writer-wins on the DB layer (matches today). The `get` returns whichever value was committed at the moment of the read. No optimistic concurrency.                                                                                                                                                            |
| `setMany` partially fails mid-transaction                                    | The whole batch rolls back. Caller sees `PillarCallError`; subsequent `getMany` returns the pre-batch state.                                                                                                                                                                                                       |
| `getMany([])` is called                                                      | Returns `{}`. Not an error. No HTTP call is short-circuited inside the SDK (the proxy still issues the request; the server returns `{}`). Tests assert this shape.                                                                                                                                                 |
| Server-side `pillar('core')` is invoked without `POPS_INTERNAL_API_KEY`      | Throws `PillarServerSdkError` on first call. Fails closed; no silent unauthenticated request. CI fixtures provision the key; local dev pulls from `.env.local`.                                                                                                                                                    |
| A consumer needs `list` (paginated search) cross-pillar                      | Out of scope for PRD-247 — no current consumer needs it. If a future caller does, extend the surface in a follow-up. The monolith router keeps `list` for the existing in-pillar `app-core` settings UI.                                                                                                           |
| The 15 media call sites can't all flip in one PR                             | Per-site PRs are fine. PRD-247 US-03 (the burn-down) tracks per-file completion. The allow-list shrinks per PR. Intermediate states (some files on SDK, some on direct import) must still typecheck + lint + build green.                                                                                          |
| A call site needs the typed key enum (`SETTINGS_KEY_VALUES`) post-cutover    | Import `type { SettingsKey } from '@pops/core-db'` (type-only) or `from '@pops/contracts-core'` once the contract package re-exports it. Either is acceptable; type-only imports of `@pops/core-db` are not H8 violations.                                                                                         |

## User Stories

| #   | Story                                                                     | Summary                                                                                                                                                                                                                                                                | Status                                                                                                                        | Parallelisable                                 |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 01  | [us-01-core-api-settings-router](us-01-core-api-settings-router.md)       | Mount `settings.{get, set, ensure, delete, getMany, setMany}` on `pops-core-api`'s `coreRouter`. Reuses `@pops/core-db`'s `settingsService`. Renames in-monolith `getBulk`/`setBulk` → `getMany`/`setMany` in lockstep.                                                | Partial                                                                                                                       | Foundational — blocks US-03, US-04             |
| 02  | [us-02-server-sdk-consumer-pattern](us-02-server-sdk-consumer-pattern.md) | Document the server-side `pillar('<other>').*` consumer pattern in `docs/themes/13-pillar-finale/notes/`. Cover async signatures, `PillarCallError` handling, service-account auth, and discovery-cache behaviour. Pattern doc is the reference for PRD-248 + PRD-249. | Not started                                                                                                                   | Yes — independent of US-03/04 once US-01 lands |
| 03  | [us-03-media-call-site-burn-down](us-03-media-call-site-burn-down.md)     | Flip the 15 media files under `arr/`, `plex/`, `rotation/` from `settingsService.*` to `await pillar('core').settings.*`. Hot Plex paths use `getMany`. Allow-list entries removed.                                                                                    | Done — arr + rotation slice landed in #3302 (5 known-violations removed); plex slice removes the 6 remaining plex H8 entries. | Blocked by US-01; can split into per-dir PRs   |
| 04  | [us-04-integration-test](us-04-integration-test.md)                       | End-to-end test that starts `pops-core-api` + `pops-api`, has pops-api call `pillar('core').settings.{get,set,getMany}` from a media handler, and verifies wire-level correctness + the discovery cache.                                                               | Done                                                                                                                          | Blocked by US-01                               |

US-01 is foundational. US-02 (pattern doc) and US-04 (integration test) can land alongside or after US-01. US-03 (the burn-down) is the consumer side; it closes the [PRD-246](../246-shell-api-pillar-decoupling/README.md) US-04 Site 8 blocker.

## Acceptance Criteria

Tracked per-US — summary here for orientation:

- `pops-core-api`'s `coreRouter` exposes `settings.{get, set, ensure, delete, getMany, setMany}` with zod-validated inputs / outputs matching the in-monolith shape.
- The contract package emits typed procedure handles for `pillar<CoreRouter>('core').settings.*`.
- The in-monolith router's `getBulk` / `setBulk` are renamed to `getMany` / `setMany` (and `ensure` is newly exposed) so both bindings present the same map.
- A pattern doc under [`docs/themes/13-pillar-finale/notes/server-pillar-sdk-consumer-pattern.md`](../../notes/server-pillar-sdk-consumer-pattern.md) documents async signatures, `PillarCallError` handling, service-account auth, and discovery-cache. PRD-248 and PRD-249 reference it.
- The 15 media files under `arr/`, `plex/`, `rotation/` contain no runtime `@pops/core-db` import (type-only is fine for `SETTINGS_KEYS`). Their hot read paths (Plex sync) use `getMany`. Matching `.dependency-cruiser-known-violations.json` entries removed.
- Integration test boots both APIs and asserts wire-level cross-pillar settings reads + writes succeed.
- `pnpm --filter @pops/pops-core-api typecheck/test/build`, `pnpm --filter @pops/pops-api typecheck/test/build`, and the full monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` pass clean.
- Husky pre-commit + pre-push pass without `--no-verify`.

## Out of Scope

- **Migrating `list` to the cross-pillar surface.** No current cross-pillar caller needs paginated search. The monolith router keeps `list` for the in-pillar settings UI.
- **Reworking the underlying `settingsService` from `@pops/core-db`.** The service layer is reused as-is. PRD-247 is a surface PRD; no schema or storage changes.
- **Encrypted-at-rest settings.** Plex token / Plex encryption seed continue to use the existing in-`service.ts` encryption helpers. Wire-level TLS sits with the dispatcher; PRD-247 does not redesign the at-rest crypto.
- **Outbox / write-ahead for `setMany`.** The transactional contract is "single-pillar atomic". Cross-pillar atomicity is out of scope (see PRD-248 for the mixed-tx design that handles the genuinely-cross-pillar case).
- **A first-class `usePillarSettings('core')` React hook.** PRD-247 is server-only. Settings UI in `app-*` packages continues to use the existing `usePillarQuery('core', ['settings', 'get'], …)` pattern from [PRD-244](../244-cross-pillar-sdk-surface/README.md).
- **Removing `@pops/core-db` from the monolith.** Pillar-local `core/*` modules still import `@pops/core-db` directly. The H8 burn-down is only about _cross-pillar_ imports.

## References

- [Server pillar SDK consumer pattern](../../notes/server-pillar-sdk-consumer-pattern.md) — async / error / auth conventions (US-02 deliverable)
- [PRD-246](../246-shell-api-pillar-decoupling/README.md) US-04 Site 8 — the consumer the surface unblocks
- [PRD-242](../242-dynamic-approuter/README.md) — the typed `pillar()` proxy this PRD consumes
- [PRD-244](../244-cross-pillar-sdk-surface/README.md) — sibling cross-pillar SDK PRD (client-side analogue)
- [PRD-153](../153-contract-package-scaffold/README.md) — contract-package scaffold that picks up the new procedures
- [PRD-156](../156-consumer-import-discipline/README.md) — gates new H8 violations; PRD-247 shrinks its allow-list (via US-03)
- [ADR-026 — Pillar architecture](../../../../architecture/adr-026-pillar-architecture.md) — the per-pillar split the H8 burn-down unblocks
- [ADR-027 — Runtime pillar registry](../../../../architecture/adr-027-runtime-pillar-registry.md) — discovery-cache source
- [Pillar isolation audit](../../notes/pillar-isolation-audit.md) §H8 — Site 8 entry (~10 files; verified 15 at grep time)
- `apps/pops-api/src/modules/core/settings/router.ts` — the reference shape promoted by US-01
- `apps/pops-api/src/modules/core/settings/service.ts` — the underlying `settingsService` consumer
- `apps/pops-core-api/src/router.ts` — where the new `settingsRouter` mounts
- `packages/pillar-sdk/src/server/factory.ts` — server-side `pillar()` consumer
