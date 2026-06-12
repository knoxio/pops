# PRD-194: Caching + invalidation

> Epic: [Unified consumption SDK](../../epics/05-unified-consumption-sdk.md)

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

| #   | Story                                                       | Summary                                                                  |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| 01  | [us-01-provider](us-01-provider.md)                         | `PillarSdkProvider` setup + subscription wiring                          |
| 02  | [us-02-invalidation-mapping](us-02-invalidation-mapping.md) | Event-to-invalidation-key mapping                                        |
| 03  | [us-03-tests](us-03-tests.md)                               | Tests: event arrives → query refetches; pillar drops → fallback rendered |

## Out of Scope

- Custom cache eviction policies.
- Persistent (localStorage) cache layer.
- Multi-tenant cache isolation.
