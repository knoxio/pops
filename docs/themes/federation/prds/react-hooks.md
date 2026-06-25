# PRD: React consumption primitives

> Theme: [Federation](../README.md)
>
> Status: **Done**

## Overview

React-facing helpers in `@pops/pillar-sdk/react` that let a frontend consume
federated pillars through `@tanstack/react-query`. Two things ship here:

1. A **stable query-key builder** (`pillarQueryKey`) so cache entries for the
   same pillar call collapse regardless of input key order.
2. A **context provider** (`PillarSdkProvider` / `usePillarSdkOptions`) that
   threads `PillarClientOptions` (transport, registry config, auth headers,
   contract version) into the hooks and composes cleanly under a host
   `QueryClientProvider`.

There is **no generic `usePillarQuery` / `usePillarMutation` hook**. Each
frontend consumes its pillars through a generated per-pillar Hey API SDK plus a
small hand-authored `*-api-helpers.ts` (`unwrap`, `isNotFoundError`,
`isUnavailableError`) wired directly into react-query's `useQuery` /
`useMutation`. The provider and query-key builder support that pattern; they do
not replace it. (The proxy-walking generic hooks were specced once and dropped —
see [docs/ideas/react-hooks.md](../../../ideas/react-hooks.md).)

## Data Model

No persistent data. The query-key builder is a pure function; the provider holds
`PillarClientOptions` in React context.

## Surface

### `@pops/pillar-sdk/react`

```ts
// Stable React Query cache key for a pillar call.
// Shape: [pillarId, ...path, stableInputKey]
export function pillarQueryKey(
  pillarId: string,
  path: readonly string[],
  input: unknown
): readonly [string, ...string[], string];

// Context for PillarClientOptions; optionally nests a QueryClientProvider
// and optionally mounts the SSE → cache invalidation bridge.
export function PillarSdkProvider(props: PillarSdkProviderProps): ReactNode;
export function usePillarSdkOptions(): PillarClientOptions;
export type PillarSdkProviderProps;

// SSE → React Query cache invalidation bridge (shared with the
// caching-invalidation PRD; see Business Rules).
export function usePillarSubscriptionBridge(
  options?: UsePillarSubscriptionBridgeOptions
): void;
export function applySubscriptionEvent(
  client: QueryClient,
  event: SubscriptionEvent
): void;
```

### Real consumption pattern (per frontend)

A pillar frontend (`@pops/app-<id>`) imports its generated SDK and helpers,
then drives react-query directly:

```ts
import { featuresSetEnabled } from '@/registry-api';
import { unwrap } from '@/registry-api-helpers';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const queryClient = useQueryClient();
useMutation({
  mutationFn: async (input) =>
    unwrap(
      await featuresSetEnabled({ path: { key: input.key }, body: { enabled: input.enabled } })
    ),
  onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['core', 'features'] }),
});
```

`unwrap` turns a Hey API `{ data, error, response }` into its payload, throwing a
typed `<Pillar>ApiError` carrying the HTTP status. The status reproduces the UX
distinctions a generic hook would have surfaced: `404 → not-found`
(`isNotFoundError`), `5xx | no status → unavailable` (`isUnavailableError`).
Mutation-success invalidation is written by hand against the
`['<pillarId>', ...routerPrefix]` key.

## Business Rules

- **Query keys are structurally stable.** `pillarQueryKey` serialises `input`
  with object keys sorted recursively, so two structurally-equal inputs (any key
  order, nested) produce the same key. `undefined` inputs collapse to `null`;
  `undefined` object values are dropped. Array element order is preserved.
- **The provider is layering-friendly.** With no `queryClient` prop it composes
  under an existing host `QueryClientProvider` (the common case in
  `pillars/shell`, which owns its own). With a `queryClient` prop it nests a
  `QueryClientProvider` for convenience. The hooks read whichever `QueryClient`
  is closest.
- **No provider → empty options.** `usePillarSdkOptions` returns `{}` when no
  `PillarSdkProvider` is mounted; the SDK falls back to its built-in defaults
  (shared discovery cache, default fetch, no auth headers).
- **The SSE bridge is opt-in.** `PillarSdkProvider` mounts
  `usePillarSubscriptionBridge` only when `subscribe` is set. It is off by
  default so tests stay deterministic and CLI consumers do not open sockets. The
  bridge's invalidation semantics are owned by the
  [caching-invalidation](caching-invalidation.md) PRD; it is re-exported
  from this module for convenience and is documented here only as it relates to
  provider wiring.

## Edge Cases

| Case                                                  | Behaviour                                                                                                               |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Pillar unreachable / 5xx during a call                | `unwrap` throws `<Pillar>ApiError` with no status / `>=500`; `isUnavailableError` is true; react-query `isError` flips. |
| Addressed entity missing (404)                        | `unwrap` throws with status `404`; `isNotFoundError` is true; call sites branch without unpacking the error.            |
| Two structurally-equal inputs, different key order    | `pillarQueryKey` produces identical keys → cache hit across components.                                                 |
| No `PillarSdkProvider` mounted                        | `usePillarSdkOptions` returns `{}`; hooks still function on SDK defaults.                                               |
| Registry registration changes while `subscribe` is on | The SSE bridge invalidates the affected `[pillarId]` prefix; next query refetches (see caching-invalidation PRD).       |

## Acceptance Criteria

- [x] `pillarQueryKey(pillarId, path, input)` produces a key of shape
      `[pillarId, ...path, stableJson(input)]`; structurally-equal inputs (any
      key order, nested) hash to the same key; `undefined` input collapses to
      `null`; `undefined` object values are dropped; array order is preserved.
- [x] `PillarSdkProvider` threads `PillarClientOptions` into context via
      `usePillarSdkOptions`, composes under an existing host
      `QueryClientProvider`, optionally nests one when a `queryClient` prop is
      supplied, and gates the SSE subscription bridge behind an opt-in
      `subscribe` prop.
- [x] When no provider is mounted, `usePillarSdkOptions` returns `{}` and the
      hooks fall back to SDK defaults.
- [x] Frontends consume pillars through a generated per-pillar Hey API SDK plus
      `*-api-helpers.ts` (`unwrap`, `isNotFoundError`, `isUnavailableError`)
      driving react-query directly; mutation success invalidates the
      `['<pillarId>', ...prefix]` query prefix by hand.
- [x] Failure UX distinctions (`not-found` vs `unavailable`) are recoverable
      from the typed error's HTTP status, so call sites branch without unpacking
      the error.
- [x] `pillarQueryKey` and `PillarSdkProvider` are covered by tests under
      `libs/sdk/src/react/__tests__/` (query-key, provider).

## Out of Scope

- A generic `usePillarQuery` / `usePillarMutation` proxy-walking hook pair, and a
  shell-page migration to them — never shipped; captured in
  [docs/ideas/react-hooks.md](../../../ideas/react-hooks.md).
- New caching strategies; existing react-query patterns are preserved.
- Optimistic-UI helpers beyond react-query basics (`onMutate` / rollback are
  available through native react-query options).
- Suspense / Concurrent features (separate React upgrade).
- SSE → cache-invalidation semantics — owned by the
  [caching-invalidation](caching-invalidation.md) PRD.
