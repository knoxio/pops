# PillarGuard

> Theme: [Federation](../README.md)
>
> Status: **Partial** — the per-route guard, boot-snapshot provider, and unavailable placeholder ship and cover the healthy / unavailable / unknown branches with i18n + a retry affordance. The live re-render path (re-render on registry change without a user-triggered refresh) is not wired into the guard. See [Acceptance Criteria](#acceptance-criteria) and the deferred work in [docs/ideas/pillar-guard-rewrite.md](../../../ideas/pillar-guard-rewrite.md).

## Overview

Each app module mounts under `/<module-id>/*` in the shell. A module's backend is owned by a pillar; that pillar can be down (container restarting, health check failing) while the rest of the fleet is healthy. `PillarGuard` short-circuits a module's route subtree to an "unavailable" placeholder when the owning pillar is unhealthy, and renders the module's content otherwise.

The guard reads a shell-side boot snapshot of pillar health rather than static module config. The snapshot is fetched once at app mount from the registry pillar's aggregated health endpoint. A pillar that is down at boot degrades its routes; the user can retry without a full page reload.

The guard is per-pillar, not per-procedure. Individual request failures (a single GET returning 500) are handled by React Query at the call site, not by this guard.

## Data Model

No persisted data. The shell holds an in-memory boot snapshot:

```ts
type PillarHealthStatus = 'healthy' | 'unavailable' | 'unknown';

interface PillarBootSnapshot {
  readonly entries: readonly PillarRegistryEntry[]; // { id, baseUrl }
  readonly health: Readonly<Record<string, PillarHealthStatus>>;
}
```

- `'healthy'` / `'unavailable'` come from the registry's aggregated probe.
- `'unknown'` is shell-synthesised: the boot fetch hasn't completed, failed outright, or the pillar id is absent from the health map. The guard treats `'unknown'` as renderable (anti-flash, see [Business Rules](#business-rules)).

`PillarRegistryEntry.baseUrl` values are container-network addresses (e.g. `http://food-api:3000`) and are **not** reachable from the browser. The shell stores them for downstream UI (status badges, ops surfaces) but never opens a browser-to-pillar connection. All cross-pillar fan-out runs server-side on the registry's aggregator.

## REST Surface (consumed)

The shell consults two registry-pillar endpoints at boot, both proxied through the shell's nginx to `registry-api`:

| Method | Path              | Response                                             | Notes                                                                                |
| ------ | ----------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET`  | `/pillars`        | `{ pillars: PillarRegistryEntry[] }`                 | Authoritative registry snapshot. The registry self-entry is always included.         |
| `GET`  | `/pillars/health` | `{ health: Record<id, 'healthy' \| 'unavailable'> }` | Aggregated probe. The registry fans out `GET {baseUrl}/health` to each known pillar. |

Both fetches are **soft-failing** with a 3 s per-request timeout:

- A registry fetch that errors, mis-parses, or returns an empty list collapses to a single synthetic `registry` self-entry, so the shell always has at least one pillar to reason about.
- A health fetch that fails returns an empty map; every pillar then reports `'unknown'`, which the guard renders through.

The registry aggregator probe (`GET {baseUrl}/health`) treats any non-200, parse error, timeout, network failure, shape mismatch, **or a `pillar` field that doesn't match the registry id** as `'unavailable'` — a mis-pointed registry entry reports unavailable rather than silently misreporting the wrong service's health.

## API Surface

```tsx
<PillarGuard pillarId="food">
  <Outlet />
</PillarGuard>
```

Behaviour, driven by `usePillarStatus(pillarId)`:

| Status          | Render                                |
| --------------- | ------------------------------------- |
| `'healthy'`     | children                              |
| `'unavailable'` | `<PillarUnavailableRoute pillarId />` |
| `'unknown'`     | children (anti-flash; see below)      |

The router wraps every installed app module's route subtree in a `<PillarGuard>`, mapping module id → pillar id via `pillarIdForModule`. Unmigrated modules map to the platform `registry` pillar.

`PillarUnavailableRoute` renders an i18n title + description (keyed off `pillarId`) and a retry button that calls `refresh()` on the boot context. Retry re-runs `GET /pillars` + `GET /pillars/health` against the registry — no global page reload; the shell and working pillars stay mounted. It is distinct from `NotInstalledPage` (module excluded from this build) and `NotFoundPage` (unknown URL): this fires when the module IS installed but its backend pillar is unreachable.

Public surface (`pillars/shell/src/app/pillars/index.ts`):

- `PillarGuard` — per-route guard.
- `PillarStatusProvider` — top-level provider, mounted in `App.tsx`, owns the single boot fetch.
- `PillarUnavailableRoute` — the default placeholder.
- `usePillarStatus(pillarId)` / `usePillarStatusContext()` — consumer hooks.
- `pillarIdForModule(moduleId)` / `REGISTRY_PILLAR_ID` — module→pillar mapping.

## Business Rules

- **Granularity is per-pillar.** No per-procedure guards. Single-request failures live in React Query at the call site.
- **`'unknown'` renders children, not a placeholder.** A slow or failed boot must not flash an "unavailable" placeholder over a working route. Only an explicit `'unavailable'` from the aggregated probe short-circuits to the placeholder.
- **The placeholder is route-shaped, not a slot.** The guard takes only `pillarId` + `children`; the placeholder component is fixed (no per-pillar `fallback` override).
- **The shell never reads `POPS_PILLARS`.** That env var lives on the registry pillar. The shell only consumes the two HTTP endpoints above.
- **Retry is scoped, not global.** The retry affordance re-fetches the boot snapshot; it does not reload the page or remount working pillars.

## Edge Cases

| Case                                     | Behaviour                                                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Boot fetch in flight                     | Every pillar reports `'unknown'`; all routes render optimistically. No placeholder flash.                              |
| Registry fetch fails                     | Collapses to the synthetic `registry` self-entry; shell still boots.                                                   |
| Health fetch fails                       | Empty map → every pillar `'unknown'` → all routes render.                                                              |
| Pillar id missing from health map        | Reported `'unknown'` → renders children.                                                                               |
| Pillar down at boot                      | `'unavailable'` → placeholder; retry re-probes and swaps to content on recovery.                                       |
| Pillar registers / recovers mid-session  | **Not auto-detected.** The guard re-renders only after a user-triggered `refresh()` (the Retry button). See ideas doc. |
| Pillar flaps healthy→unavailable→healthy | **No debounce / hysteresis.** Not exercised end-to-end (no live subscription drives the guard). See ideas doc.         |

## Acceptance Criteria

US files referenced by the original scope were never authored; acceptance criteria live inline. `[x]` only where code supports it.

- [x] `PillarGuard` accepts a pillar identifier (`pillarId`) and consults a shell-side boot snapshot of registry health rather than static module config.
- [x] Status `'healthy'` renders children.
- [x] Status `'unavailable'` renders the default placeholder (`PillarUnavailableRoute`).
- [x] Status `'unknown'` renders children — deliberate anti-flash for slow / failed boots (registry-client + provider report missing health as `'unknown'`; guard falls through). RTL test covers this branch.
- [x] A default unavailable placeholder exists and is reusable: i18n-ready (`shell.pillarUnavailable*` in `libs/locales`), has a retry affordance that re-runs the boot fetch, and is exported from the pillars module.
- [x] The router wraps every installed app module's route subtree in `<PillarGuard>`, mapping module id → pillar id via `pillarIdForModule`.
- [x] The boot snapshot is fetched once at mount from `GET /pillars` + `GET /pillars/health`, with soft-failure fallbacks (synthetic self-entry / empty health map) and a 3 s per-request timeout.
- [x] RTL coverage exists for the guard (all three branches) and the provider (loading → resolved, missing-id `'unknown'`, `refresh()` re-fetch, out-of-provider throw, fresh-mount re-fetch).
- [ ] The guard re-renders on a registry change without a user-triggered refresh (pillar registers / recovers mid-session → content appears automatically). **Not built** — the provider only refetches on a manual `refresh()`. The SDK's `usePillarSubscriptionBridge` (SSE → React Query invalidation) is not wired into the boot snapshot. See ideas doc.
- [ ] Customisable placeholder per pillar (optional `fallback` prop on `PillarGuard`). **Not built** — the guard takes only `pillarId` + `children`. See ideas doc.
- [ ] Pillar flap (healthy → unavailable → healthy in <2 s) shows one brief unavailable render with no UX disaster. **Not built** — no debounce / hysteresis and no live subscription to drive flap behaviour. See ideas doc.
- [ ] Playwright e2e: pillar down → placeholder; pillar up → content, on a live `/pillars/health` change. **Not built** — existing coverage is RTL unit-level only. See ideas doc.

## Out of Scope

- New placeholder visual designs.
- Per-route / per-procedure request-failure handling (lives in React Query at the call site).
- Cross-pillar widget guards (a widget that fans out to several pillars).
