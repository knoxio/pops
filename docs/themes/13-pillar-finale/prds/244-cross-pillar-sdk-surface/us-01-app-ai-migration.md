# US-01: Migrate `app-ai` (14 sites) onto `pillar('core').*` SDK surface

> PRD: [PRD-244 — Cross-pillar SDK surface](README.md)

## Description

As an `app-ai` consumer, I want every `trpc.core.ai*` call site swapped to the
existing PRD-227 SDK surface (`usePillarQuery('core', …)` /
`usePillarMutation('core', …)`) so that `app-ai` ships without depending on
`@pops/api-client` and the cross-pillar AI surface is consumed through the
same affordance as every other pillar.

## Acceptance Criteria

- [ ] Every call site listed in [app-ai-consumer-inventory.md](../../notes/app-ai-consumer-inventory.md) is migrated:
  - [ ] `pages/AiUsagePage.tsx` — 3× `core.aiObservability.{getStats,getHistory,getQualityMetrics}` on `usePillarQuery('core', …)`.
  - [ ] `pages/cache-management/useCacheManagementModel.ts` — 4× `core.aiUsage.{clearStaleCache,clearAllCache,cacheStats,getStats}` on the SDK surface.
  - [ ] `pages/ai-usage/cache-management/useCacheCardModel.ts` — 3× `core.aiUsage.{clearStaleCache,clearAllCache,cacheStats}` on the SDK surface.
  - [ ] `pages/ai-usage/budget-status-section.tsx` — 1× `core.aiBudgets.getBudgetStatus` on `usePillarQuery('core', …)`.
  - [ ] `pages/ai-usage/provider-status-section.tsx` — 2× `core.aiProviders.{list,healthCheck}` on `usePillarQuery('core', …)`.
  - [ ] `pages/ai-usage/latency-section.tsx` — 1× `core.aiObservability.getLatencyStats` on `usePillarQuery('core', …)`.
- [ ] No `trpc.core.ai*` reference remains under `packages/app-ai/src/`.
- [ ] No import of `@pops/api-client` remains under `packages/app-ai/src/`. The
      `package.json` dependency drop is US-04's deliverable; this US removes
      the source-code references so US-04 can land cleanly.
- [ ] `trpc.useUtils()` invalidation chains (the 3 files flagged in the audit)
      switch to `usePillarUtils('core').invalidate(['<router>', '<proc>'])`
      where applicable. No cross-pillar utils surface is introduced — each
      invalidation targets `core`.
- [ ] Test mocks under `packages/app-ai/src/` flip from mocking
      `@pops/api-client` to mocking the SDK module per the existing PRD-227
      pattern (see `app-inventory` migration in PR
      [#3146](https://github.com/knoxio/pops/pull/3146) for the reference shape).
- [ ] `pnpm --filter @pops/app-ai typecheck/test/build` passes clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- All 14 sites are Medium-bucket in the audit. No optimistic updates, no
  suspense queries, no infinite queries — the migration is mechanical.
- The duplication between `useCacheManagementModel.ts` and
  `useCacheCardModel.ts` is **not** consolidated in this US. The audit
  flagged it as a follow-up; PRD-244 migrates both as-is. Track consolidation
  separately if it becomes a problem.
- The AI surface lives on `core` per ADR-035 — do not invent a
  `@pops/ai-sdk` or split it off into its own pillar. The pillarId is
  literally `'core'` for every call in this US.
- The Wave-4 reference migration for the SDK swap shape lives in PR
  [#3055](https://github.com/knoxio/pops/pull/3055) (`NudgeIndicator`
  canary) and the recent batched migrations in PR
  [#3146](https://github.com/knoxio/pops/pull/3146).
- Worktree quirk: `pnpm install --frozen-lockfile` before husky.
