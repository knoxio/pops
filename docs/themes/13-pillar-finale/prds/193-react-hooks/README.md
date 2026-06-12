# PRD-193: React hooks

> Epic: [Unified consumption SDK](../../epics/05-unified-consumption-sdk.md)

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

## User Stories

| #   | Story                                                         | Summary                                                               |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| 01  | [us-01-usePillarQuery](us-01-usePillarQuery.md)               | Hook signature + impl                                                 |
| 02  | [us-02-usePillarMutation](us-02-usePillarMutation.md)         | Mutation hook with optimistic + rollback                              |
| 03  | [us-03-query-key-strategy](us-03-query-key-strategy.md)       | Stable query keys; input hashing                                      |
| 04  | [us-04-shell-migration-pilot](us-04-shell-migration-pilot.md) | Migrate one shell page to `usePillarQuery`; verify behavioural parity |

## Out of Scope

- New caching strategies; existing React Query patterns preserved.
- Optimistic UI helpers beyond React Query basics.
- Suspense / Concurrent features (separate React upgrade).
