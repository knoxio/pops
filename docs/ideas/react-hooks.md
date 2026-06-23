# Idea: Generic `usePillarQuery` / `usePillarMutation` hooks

A generic, fully-typed React Query hook pair that wraps any pillar call by
walking the `pillar()` SDK proxy by a `path` tuple — so a frontend never
hand-writes a `useQuery` / `useMutation` per endpoint.

Specced once under the old federation plan, **not built**. The frontends went a
different way: each consumes a generated per-pillar Hey API SDK plus a small
`*-api-helpers.ts` shim wired directly into react-query (see the
[react-hooks PRD](../themes/federation/prds/react-hooks/README.md)). The generic
hooks below would sit on top of that, or replace the per-frontend boilerplate.

## Proposed surface

```ts
// @pops/pillar-sdk/react

export function usePillarQuery<P extends KnownPillarId, Path extends ProcedurePathFor<P>>(
  pillarId: P,
  path: Path,
  input: InputFor<P, Path>,
  options?: UseQueryOptions
): UseQueryResult<OutputFor<P, Path>>;

export function usePillarMutation<...>(...): UseMutationResult<...>;
```

Internally each hook walks the typed `pillar()` proxy by `path`
(`pillar('finance').wishlist.list({...})`), throws on any non-`ok` `CallResult`
(`.orThrow()` semantics) so react-query's `isError` reflects pillar failures
uniformly, and reuses `pillarQueryKey` for the cache key.

## What it would add over the current pattern

- **End-to-end types from `KnownPillarId` + `ProcedurePathFor`** so the `path`,
  `input`, and result are all inferred — no generated-SDK import per call site.
- **Decorated result flags** `isContractMismatch`, `isUnavailable`,
  `isDegraded`, derived from the underlying `CallFailure.kind`, so call sites
  branch without unpacking the error. (Today the typed `<Pillar>ApiError` status
  carries `not-found` vs `unavailable`, but not `degraded` /
  `contract-mismatch`.)
- **Automatic router-prefix invalidation on mutation success** —
  `[pillarId, ...path.slice(0, -1)]`, single-segment paths invalidating the
  whole `[pillarId]` prefix — instead of every frontend hand-writing the
  `invalidateQueries` key.
- **react-query options pass-through** (`onMutate`, `onError`, retry, stale
  time) unchanged on both hooks, with optimistic-update / rollback via native
  react-query options.

## Companion work (also not done)

- Migrate at least one shell page from a direct generated-SDK call to
  `usePillarQuery` and verify behavioural parity (the old US-04). No frontend
  references such hooks today; the per-pillar `*-api-helpers` docstrings note the
  flags "used to come from `usePillarQuery`", i.e. the generic hook was removed.

## Why deferred

The generated per-pillar SDK + `*-api-helpers` pattern already gives typed calls
and the `not-found` / `unavailable` distinction with no extra abstraction layer.
The generic hooks are worth it only if the per-frontend boilerplate or the
missing `degraded` / `contract-mismatch` branching becomes a real pain point.
