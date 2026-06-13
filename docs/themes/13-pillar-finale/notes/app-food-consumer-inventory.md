# app-food Consumer Inventory (PRD-227 round 2)

Static audit of `packages/app-food/src/` for tRPC consumer call sites that will
need to be cut over to per-pillar SDKs (`@pops/food-sdk`, plus a thin
`@pops/lists-sdk` dependency for one cross-pillar call).

This document is **audit-only**. No migration in this PR.

## Summary

| Metric                                              | Value    |
| --------------------------------------------------- | -------- |
| Total tRPC call sites (`useQuery` / `useMutation`)  | **124**  |
| Files containing at least one call site             | **63**   |
| `trpc.useUtils()` consumers (cache invalidation)    | 30 files |
| Calls into `trpc.food.*` (pillar-local)             | **123**  |
| Cross-pillar calls (`trpc.lists.*`)                 | **1**    |
| Direct `getDrizzle()` usage                         | 0        |
| Raw `fetch('/trpc/…')` usage                        | 0        |
| Optimistic updates (`utils.*.setData` / `onMutate`) | 2 files  |
| `useSuspenseQuery` / `useInfiniteQuery`             | 1        |

The package consumes `@pops/api-client` and the pillar's contract package
(`@pops/food-contracts`). No deep `@pops/api/modules/**` imports detected.

## Triage

| Bucket      | Count | Definition                                                                                      | Notes                                                                |
| ----------- | ----- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Trivial** | 118   | Single-router `trpc.food.*` call, plain query or mutation, plain `utils.invalidate` only        | Bulk of the package. Migrate first.                                  |
| **Medium**  | 3     | Cross-pillar call (`trpc.lists.list.list`, 1) or `useInfiniteQuery` wrapper (`recipes.list`, 2) | Need `usePillarQuery`-style wrapping for the infinite query.         |
| **Risky**   | 3     | Optimistic `onMutate` + `utils.food.inbox.list*.setData` rollback chains                        | 2 files (`useFailedTab`, `useRejectedTab`) holding 3 mutation sites. |

Total = 118 + 3 + 3 = 124 (matches call-site count).

## Call sites by router

| Router               | Calls |
| -------------------- | ----- |
| `food.recipes`       | 22    |
| `food.plan`          | 20    |
| `food.ingredients`   | 20    |
| `food.inbox`         | 10    |
| `food.batches`       | 10    |
| `food.conversions`   | 8     |
| `food.substitutions` | 6     |
| `food.aliases`       | 6     |
| `food.prepStates`    | 4     |
| `food.variants`      | 3     |
| `food.slugs`         | 3     |
| `food.shopping`      | 2     |
| `food.ingest`        | 2     |
| `food.heroImage`     | 2     |
| `food.fridge`        | 2     |
| `food.cook`          | 2     |
| `food.solver`        | 1     |
| `lists.list`         | 1     |

## Risky sites detail

### Optimistic mutations (3 calls, 2 files)

- `pages/inbox/useFailedTab.ts` — `food.inbox.discard` mutation with
  `onMutate` that snapshots and writes through
  `utils.food.inbox.listFailed.setData(...)`; rollback on error and
  invalidate on settle.
- `pages/inbox/useRejectedTab.ts` — `food.inbox.restore` mutation with the
  same optimistic-update + rollback pattern against
  `utils.food.inbox.listRejected.setData(...)`.

These need the `@pops/food-sdk` adapter to expose either:

1. An `setQueryData`-equivalent helper keyed on the same input shape, or
2. A thin `usePillarOptimisticMutation` wrapper that hides the
   `setData`/snapshot/rollback choreography.

Without one of those, these sites can't move without losing the
zero-latency UX they currently provide.

### Cross-pillar (1 call, 1 file)

- `pages/recipes/send-to-list/useSendToListData.ts` — calls
  `trpc.lists.list.list.useQuery(...)` to populate the "send to" list
  picker. Blocked on `@pops/lists-sdk` ship; otherwise mechanical.

### Infinite query (2 call sites, 1 file)

- `pages/recipes/useRecipeListQuery.ts` —
  `trpc.food.recipes.list.useInfiniteQuery(...)`. The hook is already
  encapsulated, so once `@pops/food-sdk` exposes an equivalent infinite
  helper this becomes mechanical.

(Note: `dsl-editor/use-dsl-autocomplete-sources.ts` uses
`trpc.useUtils().*.fetch` imperatively rather than via a hook — counted under
the Trivial bucket because it's a single sync call that maps 1:1 to an SDK
imperative fetch helper.)

## Migration ordering

1. **Trivial (118)** — once `@pops/food-sdk` React adapter ships, swap
   `trpc.food.*` for the equivalent SDK hook. The 30 files using
   `trpc.useUtils()` are still trivial; every invalidated key sits inside
   `food.*`.
2. **Medium (3)** — pull in `@pops/lists-sdk` for the single
   `trpc.lists.list.list` call; cut the two `useInfiniteQuery` sites once the
   SDK exposes the equivalent. Easy if the SDK design copies tRPC's
   `useInfiniteQuery` shape.
3. **Risky (3)** — the two `useFailedTab` / `useRejectedTab` optimistic
   mutations need either an SDK setData helper or an optimistic-mutation
   wrapper. Coordinate with `food-sdk` design before migrating these.

## Caveats / unknowns

- Test files excluded from counts. They mock `@pops/api-client` today and will
  need to switch mock targets when the SDK lands.
- `@pops/food-contracts` is already in place and re-exported from the package
  index; SDK type re-exports must keep that compatibility.
- This package is the largest of the four audited in round 2 by a wide
  margin (124 calls vs 14–45 elsewhere). Best to chunk migrations
  per-router (recipes/plan/ingredients first — they account for ~50% of the
  surface).
