# PillarGuard — live re-render, customisable fallback, flap handling, e2e

Deferred scope for [PillarGuard](../themes/federation/prds/pillar-guard-rewrite.md). The guard, boot-snapshot provider, and placeholder ship today; the items below are not built.

## Live re-render on registry change

Today the boot snapshot is fetched once at mount and only re-fetched when the user clicks Retry (`refresh()`). A pillar that registers or recovers mid-session does not light its routes back up until a manual refresh.

The SDK already ships the plumbing to do this automatically:

- `pillars/registry` exposes `GET /registry/subscribe` — an SSE stream emitting `pillar.snapshot` (on connect), `pillar.registered`, `pillar.deregistered`, `pillar.health-changed`.
- `@pops/pillar-sdk/react` exposes `usePillarSubscriptionBridge`, which opens that stream (with reconnect via `startReconnectingSubscription`) and invalidates the React Query cache by pillar-id prefix.

What's missing is connecting registry change events to the shell's boot snapshot so `PillarStatusProvider` re-derives health and the guard re-renders. Two shapes worth considering:

1. Subscribe in `PillarStatusProvider` and call `refresh()` (debounced) on `pillar.health-changed` / `pillar.registered` / `pillar.deregistered`.
2. Move pillar health into a React Query query keyed under `['registry', ...]` so `usePillarSubscriptionBridge` invalidation refetches it for free, and have the guard read that query instead of context.

Either way: define which event types trigger a re-derive, and avoid a full-snapshot refetch storm on reconnect.

## Customisable per-pillar placeholder

`PillarGuard` currently renders the fixed `PillarUnavailableRoute`. Add an optional `fallback` slot so a pillar can supply a bespoke unavailable view:

```tsx
<PillarGuard pillarId="finance" fallback={<FinanceOffline />}>
  <Outlet />
</PillarGuard>
```

Default stays `PillarUnavailableRoute` when no `fallback` is passed.

## Flap handling (debounce / hysteresis)

A pillar that flaps healthy → unavailable → healthy in under ~2 s should produce at most one brief unavailable render, not a strobe. Needs debounce or hysteresis on the status transition. Cannot be exercised end-to-end until the live subscription path (above) drives the guard.

## Playwright e2e

No e2e currently exercises the placeholder ↔ content swap on a live health change. Add a spec:

- Pillar down → route renders `PillarUnavailableRoute`.
- Pillar recovers (live `/pillars/health` flips to `'healthy'`) → route renders the module content.

Depends on the live re-render path so the swap happens without a manual refresh.

## `'unknown'` → skeleton + retry (rejected as-is)

An earlier design called for `'unknown'` to render a skeleton + retry message. The shipped guard deliberately renders children on `'unknown'` to avoid flashing placeholders over working routes during a slow boot. Revisit only if a concrete UX problem with the optimistic render surfaces; otherwise the anti-flash behaviour stands.
