# app-lists Consumer Inventory (PRD-227 round 2)

Static audit of `packages/app-lists/src/` for tRPC consumer call sites that
will need to be cut over to per-pillar SDKs (`@pops/lists-sdk`).

This document is **audit-only**. No migration in this PR.

## Summary

| Metric                                              | Value   |
| --------------------------------------------------- | ------- |
| Total tRPC call sites (`useQuery` / `useMutation`)  | **17**  |
| Files containing at least one call site             | **6**   |
| `trpc.useUtils()` consumers (cache invalidation)    | 4 files |
| Calls into `trpc.lists.*` (pillar-local)            | **17**  |
| Cross-pillar calls                                  | **0**   |
| Direct `getDrizzle()` usage                         | 0       |
| Raw `fetch('/trpc/…')` usage                        | 0       |
| Optimistic updates (`utils.*.setData` / `onMutate`) | 3 calls |
| `useSuspenseQuery` / `useInfiniteQuery`             | 0       |

Self-contained against the `lists` namespace. No cross-pillar coupling. The
only `useSuspenseQuery` / `useInfiniteQuery` match in the package is inside a
doc comment, not a real call.

## Triage

| Bucket      | Count | Definition                                                             | Notes                                                             |
| ----------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Trivial** | 14    | Single-router `trpc.lists.*` call, plain `utils.invalidate` only       | Standard query / mutation hooks across the 6 files.               |
| **Medium**  | 0     | —                                                                      | None.                                                             |
| **Risky**   | 3     | Optimistic `setData` writes on `lists.list.get` with snapshot rollback | 1 file (`useShoppingBulkMutations.ts`) holding 3 `setData` calls. |

Total = 14 + 0 + 3 = 17 (matches call-site count).

## Call sites by router

| Router        | Calls |
| ------------- | ----- |
| `lists.list`  | 9     |
| `lists.items` | 8     |

## Call sites by file

- `pages/ListDetailPage.tsx` — `lists.list.get.useQuery` (1).
- `pages/lists-index/useListsIndexQuery.ts` — `lists.list.list.useQuery` (1).
- `pages/lists-index/ListNewModal.tsx` — `lists.list.create.useMutation` (1).
- `pages/detail/useDetailMutations.ts` — `lists.list.{update,archive,unarchive,delete}` (4).
- `pages/detail/useItemMutations.ts` — `lists.items.{add,check,uncheck,update,remove,reorder}` (6).
- `pages/components/shopping/useShoppingBulkMutations.ts` —
  `lists.items.{uncheckAll,removeChecked}` (2 mutations) with **3 optimistic
  `setData` calls** against `utils.lists.list.get` (snapshot + apply +
  rollback).

## Risky sites detail

### Optimistic mutations (3 setData calls, 1 file)

- `pages/components/shopping/useShoppingBulkMutations.ts` — bulk
  uncheck-all and remove-checked actions. The mutation handler:
  1. `get.setData({ id }, previous)` (rollback path on error).
  2. `get.setData({ id }, (prev) => mapDetail(prev, mapItem))` (apply mapItem).
  3. `get.setData({ id }, (prev) => filterDetail(prev, predicate))` (filter).

  Bulk-list semantics: the page mutates dozens of items at once, so the
  optimistic UX is load-bearing — falling back to invalidate-only would
  show a visible empty-then-refresh flash.

  Same SDK ask as `app-food`: the `@pops/lists-sdk` adapter needs an
  equivalent `setQueryData` helper or a `usePillarOptimisticMutation`
  wrapper that preserves snapshot + rollback.

## Migration ordering

1. **Trivial (14)** — once `@pops/lists-sdk` ships, swap `trpc.lists.*`
   for the equivalent SDK hook in one mechanical pass.
2. **Risky (3)** — the bulk-mutations site must wait until the SDK exposes
   an optimistic-write surface. Coordinate with `lists-sdk` design.

## Caveats / unknowns

- Test files excluded from counts.
- `useDetailMutations.ts` exports a `ReturnType<typeof trpc.lists.list.update.useMutation>`
  type alias and a `ReturnType<typeof trpc.useUtils>` parameter type. Not
  separate call sites, but the SDK type surface must support these patterns
  or the helper signatures need updating.
- `useShoppingBulkMutations.ts` declares
  `type DetailQueryUtils = ReturnType<typeof trpc.useUtils>['lists']['list']['get']`
  — same caveat.
- This package and `app-cerebrum` together total 62 trivial calls — a clean
  staging ground for end-to-end `lists-sdk` + `cerebrum-sdk` cutover dry runs.
