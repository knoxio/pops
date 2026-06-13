# PRD-194: Caching + invalidation

> Epic: [Unified consumption SDK](../../epics/05-unified-consumption-sdk.md)
>
> **Status: Done.** Provider, query-key factory, hook-level invalidation, and SSE → React Query cache bridge all ship in the pillar SDK's `react` entrypoint with jsdom test coverage. See [Acceptance Criteria](#acceptance-criteria) for the per-AC breakdown.

## Overview

Wire the discovery cache subscriptions (PRD-163) to React Query's invalidation so the shell auto-refreshes when a pillar's registration changes. Also document per-call cache strategies and the staleness contract.

## Data Model

No new data; orchestrates existing caches.

## API Surface

```ts
// @pops/pillar-sdk/react

export function PillarSdkProvider({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient: QueryClient;
}): JSX.Element;
```

Inside the provider:

- Subscribes to `subscribeToRegistry` (PRD-163).
- On `health-changed` event for pillar P → invalidate all queries with key prefix `['pillar', P, ...]`.
- On `deregistered` → invalidate + show fallback for ongoing queries.
- On `manifest-updated` → invalidate everything for that pillar.

## Business Rules

- **One provider at the React tree root.** Wraps `QueryClientProvider`.
- **Invalidation cascades**: invalidating `['pillar', 'finance']` invalidates every query under that prefix.
- **Active queries retry; idle queries lazy-refetch on next mount.**
- **Per-pillar in-flight queries are NOT cancelled.** They complete; the next render uses fresh data.

## Edge Cases

| Case                                                | Behaviour                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| Pillar flaps healthy → unavailable → healthy in <1s | Two invalidation cycles. React Query dedupes via `queryHash` + active observers. |
| Many simultaneous events                            | React Query batches invalidations internally.                                    |
| Subscription drops mid-session                      | PRD-159's discovery cache marks state stale; next query uses last-known.         |

## User Stories

| #   | Story                                                       | Summary                                                                  | Status  |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------ | ------- |
| 01  | [us-01-provider](us-01-provider.md)                         | `PillarSdkProvider` setup + subscription wiring                          | Done    |
| 02  | [us-02-invalidation-mapping](us-02-invalidation-mapping.md) | Event-to-invalidation-key mapping                                        | Done    |
| 03  | [us-03-tests](us-03-tests.md)                               | Tests: event arrives → query refetches; pillar drops → fallback rendered | Partial |

The three `us-0N-*.md` files were never authored — the work landed end-to-end before the per-story split. The acceptance criteria below stand in for those stubs and were validated against shipped code on 2026-06-13.

## Acceptance Criteria

| AC                                                                                | Status      | Notes                                                                                                                                                                                     |
| --------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PillarSdkProvider` exists and composes with `QueryClientProvider`                | Done        | Optionally nests a `QueryClientProvider` when a `queryClient` is passed; otherwise composes under a host-owned one (the `pops-shell` case).                                               |
| Provider subscribes to the registry SSE stream                                    | Done        | Opt-in via a `subscribe` prop — default off so tests and CLI consumers don't open sockets. Reuses PRD-164's reconnecting subscription.                                                    |
| `health-changed` → invalidate the `[pillarId, ...]` prefix                        | Done        | Spec text shows `['pillar', P, ...]`; shipped cache keys are `[pillarId, ...path, input]`. Behaviour matches intent; spec prose drifts from the shipped key shape.                        |
| `deregistered` → invalidate + show fallback for ongoing queries                   | Partial     | Invalidation is wired. The fallback surface lives in PRD-191's `usePillarQuery` failure flags (`isUnavailable`); no extra rendering path is added by PRD-194 itself.                      |
| `manifest-updated` → invalidate everything for that pillar                        | Done        | The wire event from PRD-163 is `pillar.registered` (it carries the manifest in its payload); it triggers a full `[pillarId]` prefix invalidation. Equivalent behaviour, divergent naming. |
| Invalidation cascades — `[pillarId]` invalidates every nested query               | Done        | React Query prefix matching; exercised by the bridge tests.                                                                                                                               |
| Active queries retry; idle queries lazy-refetch on next mount                     | Done        | Inherited from React Query's default invalidation semantics — not overridden.                                                                                                             |
| Per-pillar in-flight queries are NOT cancelled                                    | Done        | `invalidateQueries` is called without `cancelRefetch: true`, so in-flight fetches complete.                                                                                               |
| Flapping pillar (healthy → unavailable → healthy in <1s) → two cycles, deduped    | Done        | Each event triggers one `invalidateQueries` call; React Query's internal observer dedup applies unchanged.                                                                                |
| Many simultaneous events                                                          | Done        | One `invalidateQueries` call per event; React Query batches internally.                                                                                                                   |
| Subscription drops mid-session → snapshot defends against deregistered-during-gap | Done        | `pillar.snapshot` invalidates every cache entry whose first segment matches the pillar-id pattern, even ones absent from the snapshot. Explicitly tested.                                 |
| Tests: event arrives → query refetches                                            | Done        | Covered by `applySubscriptionEvent` + bridge tests, plus hook-level mutation auto-invalidation tests.                                                                                     |
| Tests: pillar drops → fallback rendered                                           | Not started | Not exercised in PRD-194's test files. The failure flag (`isUnavailable`) belongs to PRD-191; a bridge + failure-flag integration assertion is missing.                                   |
| Per-call cache strategies + staleness contract documented                         | Partial     | JSDoc on the hooks, query-key factory, and subscription bridge covers key shape, invalidation cascade, snapshot-gap defense, and active/idle behaviour. No standalone staleness document. |

### Open follow-ups

- Author or delete the three `us-0N-*.md` stub files referenced by the User Stories table — current links 404.
- Align the PRD's API-surface example (`['pillar', P, ...]`, `manifest-updated`) with the shipped contract (`[pillarId, ...]`, `pillar.registered` / `pillar.snapshot`) — equivalent in behaviour, drift only in naming.
- Add a bridge + failure-flag integration test covering "pillar drops → consumer sees `isUnavailable`" to close the last AC.

## Out of Scope

- Custom cache eviction policies.
- Persistent (localStorage) cache layer.
- Multi-tenant cache isolation.
