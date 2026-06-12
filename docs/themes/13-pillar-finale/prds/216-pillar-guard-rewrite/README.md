# PRD-216: PillarGuard rewrite

> Epic: [FE pillar SDK + dispatcher generator](../../epics/10-fe-sdk-dispatcher-generator.md)

## Overview

Today `PillarGuard` reads static config to decide whether a pillar's route should render its content or a "pillar unavailable" placeholder. Rewrite to read the live registry snapshot via `usePillarRegistry`; routes automatically degrade when a pillar drops off.

## Data Model

No data.

## API Surface

```tsx
<PillarGuard pillar="finance">
  <FinanceDashboard />
</PillarGuard>
```

Behaviour:

- Reads `usePillarRegistry` snapshot.
- If pillar status is `'healthy'` → renders children.
- If `'unavailable'` or absent → renders `<UnavailablePlaceholder pillar="finance" />`.
- If `'unknown'` → renders skeleton + retry message.

## Business Rules

- **Granularity is per-pillar.** No per-procedure guards.
- **Status changes re-render via subscription invalidation.**
- **Unavailable placeholder is customisable** per pillar (optional `fallback` prop).

## Edge Cases

| Case                                                | Behaviour                                     |
| --------------------------------------------------- | --------------------------------------------- |
| Pillar registers mid-session                        | Guard re-renders; content appears.            |
| Pillar flaps healthy → unavailable → healthy in <2s | One brief unavailable render; no UX disaster. |

## User Stories

| #   | Story                                                   | Summary                                                    |
| --- | ------------------------------------------------------- | ---------------------------------------------------------- |
| 01  | [us-01-component-rewrite](us-01-component-rewrite.md)   | Update PillarGuard to use registry hook                    |
| 02  | [us-02-fallback-component](us-02-fallback-component.md) | Default + customisable placeholder                         |
| 03  | [us-03-e2e-test](us-03-e2e-test.md)                     | Playwright: pillar down → placeholder; pillar up → content |

## Out of Scope

- New placeholder designs.
- Per-route procedure failure handling (lives in React Query).
- Cross-pillar widget guards.
