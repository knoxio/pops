# PRD-218: `@pops/module-registry` deprecation

> Epic: [FE pillar SDK + dispatcher generator](../../epics/10-fe-sdk-dispatcher-generator.md)

## Overview

The build-time `@pops/module-registry` (PRD-101) was the shell's static install-set registry. After Theme 13, the runtime registry (Epic 02) is authoritative. This PRD deprecates the build-time registry: it becomes a thin shim around the runtime registry, with an offline-dev fallback for cases where the registry isn't reachable.

## Data Model

No data.

## API Surface

The legacy `MODULES` const stays exported but becomes derived:

```ts
// @pops/module-registry (post-PRD-218)
export const MODULES = await fetchFromRuntimeRegistry().catch(() => loadOfflineSeed());
```

Offline seed is a JSON file committed for dev use; production reads the runtime registry.

## Business Rules

- **Production reads runtime registry only.** Offline seed is a fallback for `pnpm dev` when core-api isn't available.
- **`KNOWN_MODULES` export retired.** Consumers shift to `PILLARS` from `@pops/pillar-sdk`.
- **Existing consumers of `MODULES` keep working** during the transition; their references just resolve to runtime-derived data.

## Edge Cases

| Case                                 | Behaviour                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| Dev environment has core-api running | Fetched from runtime; matches prod.                                                         |
| Dev environment offline              | Falls back to seed; stale but usable.                                                       |
| Prod registry empty (cold start)     | Bootstrap order: pops-shell waits for core-api healthcheck (via depends_on) before booting. |

## User Stories

| #   | Story                                                     | Summary                                                       |
| --- | --------------------------------------------------------- | ------------------------------------------------------------- |
| 01  | [us-01-shim-implementation](us-01-shim-implementation.md) | Rewrite `@pops/module-registry` to fetch + fallback           |
| 02  | [us-02-deprecation-notice](us-02-deprecation-notice.md)   | Mark exports as `@deprecated` with migration notes            |
| 03  | [us-03-consumer-migration](us-03-consumer-migration.md)   | Migrate shell consumers from `MODULES` to `PILLARS` + runtime |

## Out of Scope

- Removing the package entirely. Stays as a shim until consumers fully migrate.
- New build-time registries.
