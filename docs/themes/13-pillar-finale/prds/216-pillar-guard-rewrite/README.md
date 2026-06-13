# PRD-216: PillarGuard rewrite

> Epic: [FE pillar SDK + dispatcher generator](../../epics/10-fe-sdk-dispatcher-generator.md)
>
> Status: **Partial** — a shell-local `PillarGuard` + `PillarStatusProvider` + `PillarUnavailableRoute` already ship under `apps/pops-shell/src/app/pillars/` (ADR-026 P3) and cover the healthy / unavailable branches with i18n + retry. The gap is the live subscription path: there is no `usePillarRegistry` hook in `@pops/pillar-sdk/react` yet (blocked on PRD-215), so the snapshot only refreshes on a user-triggered `refresh()` rather than re-rendering on registry change events. The `'unknown'` branch deliberately falls through to children (no skeleton) as an anti-flash measure during slow boots — this diverges from the PRD's "skeleton + retry message" and needs reconciling once subscription invalidation lands.

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

## Acceptance Criteria

US files referenced below were never authored; AC live inline. Status is per criterion:

- [x] `PillarGuard` accepts a pillar identifier and consults a shell-side snapshot of registry status (rather than a static module config). **Done.** _Partial deviation:_ the shipped prop name is `pillarId`, not `pillar`.
- [x] Status `'healthy'` renders children. **Done.**
- [x] Status `'unavailable'` renders the default placeholder. **Done.**
- [ ] Status `'unknown'` renders a skeleton + retry message. **Dropped** — current implementation deliberately falls through to children on `'unknown'` to avoid placeholder flashes during slow boots (ADR-026 P3 rationale). Reconcile the PRD wording with the shipped behaviour, or revisit the design.
- [ ] Reads the live registry snapshot via `usePillarRegistry`. **Not started** — shell-local provider reads a snapshot stored in shell context. `@pops/pillar-sdk/react` currently exposes query / mutation / subscription-bridge hooks but no `usePillarRegistry`. Lands with PRD-215.
- [ ] Status changes re-render via subscription invalidation (pillar registers mid-session → guard re-renders; content appears). **Not started** — the provider only refetches on a manual `refresh()` (Retry button). Blocked on PRD-215.
- [ ] Customisable placeholder per pillar (optional `fallback` prop on `PillarGuard`). **Not started** — `PillarGuard` accepts only `pillarId` and `children`; no `fallback` slot.
- [x] Default unavailable placeholder exists and is reusable. **Done** — i18n-ready (`shell.pillarUnavailable*`), has a retry affordance, exported from the pillars module. _Partial deviation:_ component is named `PillarUnavailableRoute` (route-shaped) rather than `UnavailablePlaceholder`.
- [ ] Pillar flap (healthy → unavailable → healthy in <2s) shows one brief unavailable render with no UX disaster. **Not started** — no debounce / hysteresis and no live subscription to exercise flap behaviour end-to-end.
- [ ] Playwright e2e: pillar down → placeholder; pillar up → content. **Not started** — no e2e spec exercises the placeholder ↔ content swap on a live `/pillars/health` change. Existing coverage is RTL unit-level only.

## User Stories

The three US files originally referenced were never authored; per the theme doc protocol, AC now live inline above. Historical scope table kept for traceability.

| #   | Story                                                      | Status                              |
| --- | ---------------------------------------------------------- | ----------------------------------- |
| 01  | Update PillarGuard to use registry hook                    | Partial — shell-local snapshot only |
| 02  | Default + customisable placeholder                         | Partial — default ships, no slot    |
| 03  | Playwright: pillar down → placeholder; pillar up → content | Not started                         |

## Out of Scope

- New placeholder designs.
- Per-route procedure failure handling (lives in React Query).
- Cross-pillar widget guards.
