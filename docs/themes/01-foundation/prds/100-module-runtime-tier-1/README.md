# PRD-100: Module Runtime — Tier 1

> Epic: [Modular Module Runtime](../../epics/10-modular-module-runtime.md)
> Status: In progress

## Overview

Tier 1 of the modular runtime: `POPS_APPS` and `POPS_OVERLAYS` env vars decide which optional modules are installed at boot. Backend tRPC procedures for absent modules return `NOT_FOUND`; the frontend filters routes via a single `core.shell.manifest` query and renders a "module not installed" page for direct hits. Default (env unset) preserves current behaviour.

Restart-on-change is acceptable; no hot-register.

## Env Contract

```
POPS_APPS=finance,inventory,media,cerebrum     # comma-separated, no spaces required around commas
POPS_OVERLAYS=ego
```

| Variable        | Valid values                                | Empty / unset behaviour |
| --------------- | ------------------------------------------- | ----------------------- |
| `POPS_APPS`     | `finance`, `media`, `inventory`, `cerebrum` | Install all apps        |
| `POPS_OVERLAYS` | `ego`                                       | Install all overlays    |

`core` is always installed and is not configurable — it's the platform shell, not a domain module.

`ai` is intentionally omitted from the apps set: AI Ops admin pages mount under `/cerebrum/admin/*` rather than at a top-level `/ai` route, and there is no top-level `ai` tRPC router for the gate to control. Reintroduce a top-level `ai` module before adding it back to the env contract.

Validation is strict: invalid module ids and footgun values that parse to an empty list (e.g. `POPS_APPS=,,`) fail at startup with a clear error naming the bad value and the valid set. Operators get a typo at boot, not a silent default. The parsed result is cached on first read so subsequent calls don't re-parse `process.env`. Boot-time validation lives in `apps/pops-api/src/app.ts`, which calls `readInstalledModules()` once before any handlers register.

## API Surface

`core.shell.manifest()` query returns the installed module set:

```ts
{
  apps: ['finance', 'inventory'],
  overlays: ['ego'],
}
```

The OpenAPI mirror exposes the same payload at `GET /api/v1/shell/manifest`.

## Backend Composition

A tRPC procedure-level middleware (`moduleGate` in `apps/pops-api/src/trpc.ts`) inspects the procedure path on every call. If the top-level router is a known optional app or overlay and not in the installed set, the middleware throws `TRPCError({ code: 'NOT_FOUND' })`. `core.*` is never gated.

The static `appRouter` shape is unchanged — types remain intact for the frontend client. Operational gating is runtime-only.

## Frontend Composition

`apps/pops-shell/src/app/RequireModule.tsx` is a route-level guard that fetches `core.shell.manifest` once (cached forever via React Query `staleTime: Infinity`) and renders `NotInstalledPage` when its `moduleId` is absent. Each top-level route in `apps/pops-shell/src/app/router.tsx` is wrapped with `<RequireModule moduleId="..." />` so direct navigation, deep-links, and bookmarks all degrade gracefully.

## Migrations

Per-module migration slicing is **out of scope** for Tier 1. All migrations run on every boot regardless of `POPS_APPS`. Tables for absent modules exist on disk but their procedures and routes are gated. Slicing migrations is deferred until a real driver appears (Epic 10 out-of-scope).

## Edge Cases

| Case                                                    | Behaviour                                                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `POPS_APPS=finance` and a media tRPC call arrives       | Backend returns `NOT_FOUND` with message naming the absent module.                                       |
| User bookmarks `/media/movies` with media not installed | Shell route renders `NotInstalledPage`; no 404.                                                          |
| `POPS_APPS` contains a typo (`finanace`)                | Server fails to boot with a clear error listing valid values.                                            |
| Universal search across modules                         | Currently treats absent modules as no-result. Full degradation is tracked separately (see Out of Scope). |
| URI resolver hits an absent module's URI                | Currently throws. Tolerance work is tracked separately (see Out of Scope).                               |

## User Stories

| #   | Story                                                             | Summary                                                                                       | Parallelisable   |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------- |
| 01  | [us-01-env-contract](us-01-env-contract.md)                       | `POPS_APPS` / `POPS_OVERLAYS` env vars, defaults, validation, error messages                  | Yes              |
| 02  | [us-02-backend-loader](us-02-backend-loader.md)                   | Manifest-driven router gating; absent modules' procedures return `NOT_FOUND`                  | Blocked by 01    |
| 03  | [us-03-shell-manifest-endpoint](us-03-shell-manifest-endpoint.md) | `core.shell.manifest` (and OpenAPI `GET /api/v1/shell/manifest`) returns installed module set | Blocked by 01    |
| 04  | [us-04-frontend-dynamic-load](us-04-frontend-dynamic-load.md)     | Shell uses the manifest to filter route mount via `RequireModule`                             | Blocked by 03    |
| 05  | [us-05-not-installed-page](us-05-not-installed-page.md)           | Fallback `NotInstalledPage` for absent-module routes                                          | Blocked by 04    |
| 06  | [us-06-degrade-cross-module](us-06-degrade-cross-module.md)       | URI resolver + universal search tolerate missing modules                                      | Tracked as a gap |
| 07  | [us-07-test-matrix](us-07-test-matrix.md)                         | Exercise sensible install sets (everything; finance-only; cerebrum-absent)                    | Blocked by 02–05 |

## Out of Scope

- **Per-module migration slicing.** Tables for absent modules exist on disk; only procedures + routes are gated.
- **URI resolver and universal search degradation.** Tracked as US-06 / a gap issue; minimal-fallback UX deferred until a real driver lands.
- **Tier 2 admin Modules page.** Install/remove from UI lands separately.
- **Hot-register on env change.** Restart is required.
