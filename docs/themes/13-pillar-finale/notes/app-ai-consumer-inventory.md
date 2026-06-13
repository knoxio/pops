# app-ai Consumer Inventory (PRD-227 round 2)

Static audit of `packages/app-ai/src/` for tRPC consumer call sites that will
need to be cut over to per-pillar SDKs. Unlike the other app packages, every
call in `app-ai` lives under the `core.*` namespace — the package is a
front-end for cross-pillar AI infrastructure (budgets, providers, usage,
observability, cache), not a pillar-local UI.

This document is **audit-only**. No migration in this PR.

## Summary

| Metric                                              | Value   |
| --------------------------------------------------- | ------- |
| Total tRPC call sites (`useQuery` / `useMutation`)  | **14**  |
| Files containing at least one call site             | **6**   |
| `trpc.useUtils()` consumers (cache invalidation)    | 3 files |
| Calls into pillar-local namespace                   | **0**   |
| Cross-pillar calls (`trpc.core.*`)                  | **14**  |
| Direct `getDrizzle()` usage                         | 0       |
| Raw `fetch('/trpc/…')` usage                        | 0       |
| Optimistic updates (`utils.*.setData` / `onMutate`) | 0       |
| `useSuspenseQuery` / `useInfiniteQuery`             | 0       |

The package consumes `@pops/api-client` only (no deep `@pops/api/modules/**`
type imports detected).

## Triage

| Bucket      | Count | Definition                                                                                | Notes                                                                |
| ----------- | ----- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Trivial** | 0     | —                                                                                         | Nothing is pillar-local.                                             |
| **Medium**  | 14    | `trpc.core.*` cross-pillar call, plain query / mutation with `utils.invalidate` only      | Entire package. Blocked on `@pops/core-sdk` (AI sub-surface) ship.   |
| **Risky**   | 0     | —                                                                                         | No optimistic, suspense, or infinite queries.                        |

Total = 0 + 14 + 0 = 14 (matches call-site count).

## Call sites by router

| Router                    | Calls |
| ------------------------- | ----- |
| `core.aiUsage`            | 7     |
| `core.aiObservability`    | 4     |
| `core.aiProviders`        | 2     |
| `core.aiBudgets`          | 1     |

## Call sites by file

- `pages/AiUsagePage.tsx` —
  `core.aiObservability.{getStats,getHistory,getQualityMetrics}` (3).
- `pages/cache-management/useCacheManagementModel.ts` —
  `core.aiUsage.{clearStaleCache,clearAllCache,cacheStats,getStats}` (4).
- `pages/ai-usage/cache-management/useCacheCardModel.ts` —
  `core.aiUsage.{clearStaleCache,clearAllCache,cacheStats}` (3, duplicate
  surface of the previous file in a card variant).
- `pages/ai-usage/budget-status-section.tsx` —
  `core.aiBudgets.getBudgetStatus` (1).
- `pages/ai-usage/provider-status-section.tsx` —
  `core.aiProviders.{list,healthCheck}` (2).
- `pages/ai-usage/latency-section.tsx` —
  `core.aiObservability.getLatencyStats` (1).

## Migration ordering

1. **Medium (14)** — entire package blocked on `@pops/core-sdk` exposing the
   AI sub-surface (`aiUsage`, `aiObservability`, `aiProviders`, `aiBudgets`).
   Once those land, this is a mechanical one-pass migration; all 14 sites
   are plain queries / mutations with at most a single
   `utils.core.aiUsage.invalidate()` chain.

## Caveats / unknowns

- Test files excluded from counts.
- `useCacheManagementModel.ts` and `useCacheCardModel.ts` duplicate the
  cache-management surface — investigate consolidation as part of the
  migration (out of scope for this audit).
- This package can ship behind the core SDK without coordinating with any
  pillar SDK — it's a leaf consumer of `core.*` only.
