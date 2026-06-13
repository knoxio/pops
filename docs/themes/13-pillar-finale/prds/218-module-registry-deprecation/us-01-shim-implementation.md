# PRD-218 US-01: Runtime install-set shim

> Parent: [PRD-218 `@pops/module-registry` deprecation](README.md)
>
> Status: **Done**

## Goal

Extend `@pops/module-registry` with a runtime-evaluated install set so consumers can stop reading `POPS_APPS` directly and re-implementing the env gate inline. Unblocks the 20 deferred batch-2 consumers (PR #3104) that previously called `KNOWN_MODULES.filter(...)` against `process.env.POPS_APPS`.

## Deliverable

Three additions to `@pops/module-registry`:

| Export                  | Shape                        | Semantics                                                                                                                                 |
| ----------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `INSTALLED_MODULES`     | `readonly string[]`          | `POPS_APPS` ∪ `POPS_OVERLAYS` ∩ `KNOWN_MODULES`. Empty env returns `KNOWN_MODULES` verbatim. `core` is always included regardless of env. |
| `isInstalledModule(id)` | `(value: string) => boolean` | Runtime equivalent of `isModuleId`. Returns true only when `id` is in the per-deploy install set.                                         |
| `KNOWN_MODULES`         | unchanged                    | Stays as the full build-time superset alias for backwards compatibility.                                                                  |

Filtering logic is centralised in `packages/module-registry/src/install-set.ts` (`resolveInstalledIds`) and reused by both the build script (`scripts/build.ts` → `scripts/lib.ts`) and the runtime exports — single source of truth for the `POPS_APPS` / `POPS_OVERLAYS` contract.

## Acceptance Criteria

- [x] `INSTALLED_MODULES` exported from `@pops/module-registry` root entry, evaluated at module load against `process.env`.
- [x] `isInstalledModule(id)` exported, returns `INSTALLED_MODULES.includes(id)`.
- [x] `core` always included in `INSTALLED_MODULES` even when `POPS_APPS` would exclude it.
- [x] Unknown ids in `POPS_APPS` are silently dropped (matches build-time semantics).
- [x] Existing `KNOWN_MODULES`, `MODULES`, `isModuleId`, `findModule` exports unchanged.
- [x] Build script and runtime shim share one resolver (no duplication).
- [x] Tests cover unset env, `POPS_APPS` subset, `POPS_OVERLAYS` union, unknown-id drop, whitespace handling, `core` always-installed behaviour.

## Out of Scope

- Migrating the 20 deferred consumers — that is US-02 in a follow-up PR.
- Fetching the install set from a runtime registry endpoint — that is the longer-term direction documented in the parent PRD's "API Surface" section.
- `@deprecated` JSDoc tags — also a follow-up step.
