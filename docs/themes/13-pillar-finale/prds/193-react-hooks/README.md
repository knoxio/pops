# PRD-193: React hooks

> Epic: [Unified consumption SDK](../../epics/05-unified-consumption-sdk.md)
>
> Status: **Partial**

## Overview

React Query-shaped hooks that wrap the `pillar()` SDK: `usePillarQuery`, `usePillarMutation`. Familiar mental model for shell consumers; integrates with the existing tRPC + React Query stack.

## Data Model

No data.

## API Surface

```ts
// @pops/pillar-sdk/react

export function usePillarQuery<
  P extends KnownPillarId,
  Path extends ProcedurePathFor<P>
>(
  pillarId: P,
  path: Path,
  input: InputFor<P, Path>,
  options?: UseQueryOptions
): UseQueryResult<OutputFor<P, Path>>;

export function usePillarMutation<...>(...): UseMutationResult<...>;
```

Internally calls `pillar('finance').wishlist.list({...}).orThrow()` and lets React Query handle the throw/retry/caching.

## Business Rules

- **Built on React Query (`@tanstack/react-query`).** Existing shell dependency; no new infra.
- **`.orThrow()` is used** so React Query's `isError` reflects pillar failures uniformly.
- **Query key includes pillar id + procedure path + input hash.** Stable; cache hits work across components.
- **Stale time / retries follow React Query defaults**; per-call overrides supported.

## Edge Cases

| Case                                                          | Behaviour                                                                              |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Pillar becomes unavailable mid-session                        | `isError` flips true; React Query retries per config; eventually surfaces error to UI. |
| Subscription event fires for the pillar's registration change | Discovery cache invalidates; next query re-resolves.                                   |

## Acceptance Criteria

- [x] `usePillarQuery(pillarId, path, input, options?)` exists, walks the `pillar()` proxy by `path`, returns a React Query result, and surfaces pillar failures via `isError` (the query function throws on any non-`ok` `CallResult`, equivalent to `.orThrow()` semantics).
- [x] `usePillarMutation(pillarId, path, options?)` exists, runs the same call through React Query's mutation lifecycle, and on success invalidates every cache entry under the same router prefix (`[pillarId, ...path.slice(0, -1)]`; single-segment paths invalidate the whole `[pillarId]` prefix).
- [x] Both hooks decorate the React Query result with `isContractMismatch`, `isUnavailable`, and `isDegraded` flags derived from the underlying `CallFailure.kind` so call sites can branch without unpacking the error.
- [x] React Query options (`onMutate`, `onError`, retry, stale time, etc.) pass through unchanged on both hooks; optimistic-update and rollback are supported via the host's React Query options (the PRD scopes extra optimistic helpers out — see _Out of Scope_).
- [x] Query keys are produced by a single helper, `pillarQueryKey(pillarId, path, input)`, with shape `[pillarId, ...path, stableJson(input)]`. Two structurally-equal inputs (different key order or nested key order) hash to the same key; `undefined` inputs collapse to `null`.
- [x] A `PillarSdkProvider` threads `PillarClientOptions` into context, composes cleanly under an existing host `QueryClientProvider`, optionally wraps one when a `queryClient` prop is supplied, and gates the SSE subscription bridge behind an opt-in `subscribe` prop. When no provider is mounted the hooks fall back to empty options.
- [x] An SSE → cache-invalidation bridge consumes registry events: `pillar.registered` / `deregistered` / `health-changed` invalidate the `[pillarId]` prefix, and `pillar.snapshot` invalidates every cache entry whose first key segment looks like a pillar id (so pillars deregistered during a reconnect gap also drop their stale data).
- [x] All of the above is covered by tests under `packages/pillar-sdk/src/react/__tests__/` (hooks, provider, query-key, subscription-bridge).
- [ ] At least one shell page is migrated from a direct `pillar()` / tRPC call to `usePillarQuery` with behavioural parity verified. No consumers in `apps/` reference the hooks yet — US-04 is open.

## User Stories

| #   | Story                                                                               | Status      |
| --- | ----------------------------------------------------------------------------------- | ----------- |
| 01  | usePillarQuery — hook signature + impl                                              | Done        |
| 02  | usePillarMutation — mutation hook (React Query's native `onMutate` / rollback flow) | Done        |
| 03  | Stable query keys; input hashing                                                    | Done        |
| 04  | Migrate one shell page to `usePillarQuery`; verify behavioural parity               | Not started |

## Out of Scope

- New caching strategies; existing React Query patterns preserved.
- Optimistic UI helpers beyond React Query basics.
- Suspense / Concurrent features (separate React upgrade).
