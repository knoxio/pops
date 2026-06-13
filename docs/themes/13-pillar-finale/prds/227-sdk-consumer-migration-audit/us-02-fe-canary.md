# US-02: FE canary — migrate `NudgeIndicator` to `usePillarQuery`

> PRD: [SDK consumer migration audit](README.md)

## Description

As a shell developer, I want one production component to consume the cerebrum nudges endpoint through `usePillarQuery` so the migration pattern is exercised end-to-end before fanning out to the rest of `app-*`.

## Acceptance Criteria

- [ ] `apps/pops-shell/src/app/layout/top-bar/NudgeIndicator.tsx` replaces the `trpc.cerebrum.nudges.list.useQuery(...)` call with `usePillarQuery('cerebrum', ['nudges', 'list'], { status: 'pending', limit: 1 }, { … })`.
- [ ] The retry / staleTime / refetchInterval options carry over verbatim.
- [ ] Existing `nudgeRefetchInterval` helper continues to receive the React Query `query` argument shape unchanged.
- [ ] When the cerebrum pillar is `unavailable` or returns `contract-mismatch`, the indicator hides instead of crashing — covered by a new vitest.
- [ ] The component test in `apps/pops-shell/src/app/layout/top-bar/__tests__/NudgeIndicator.test.tsx` exercises both the success path (1 pending nudge → badge renders) and the failure path (SDK returns `unavailable` → no badge).
- [ ] `pnpm --filter @pops/shell typecheck` + `pnpm --filter @pops/shell test` pass.

## Notes

Choice of canary: `cerebrum.nudges.list` is the only FE call whose target pillar (`cerebrum-api`) already advertises the route in its registry manifest. The other shell calls hit `core.*` which still lives in pops-api.
