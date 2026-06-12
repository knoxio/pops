# PRD-189: Batch call-site audit

> Epic: [Batching fix](../../epics/04-batching-fix.md)

## Overview

Find every place in the codebase where calls cross pillar boundaries within a single page / component / hook, and either eliminate them (by refactoring) or document them as known cross-pillar reads (which now go through separate batched requests post-PRD-187).

## Data Model

No data. Audit + refactor.

## API Surface

Audit produces a report at `docs/themes/13-pillar-finale/prds/189-batch-call-site-audit/audit-report.md`:

```
| File | Line | Calls | Resolution |
| --- | --- | --- | --- |
| apps/pops-shell/src/pages/dashboard/Dashboard.tsx | 42 | finance.transactions.list + finance.budgets.list | Single pillar; no change |
| apps/pops-shell/src/pages/dashboard/Dashboard.tsx | 78 | media.movies.recent + finance.transactions.recent | Cross-pillar; document or refactor |
| ... |
```

## Business Rules

- **Every cross-pillar call site is enumerated.** The audit is comprehensive.
- **Cross-pillar reads are documented, not necessarily removed.** With splitLink, each pillar's calls are batched independently — cross-pillar reads now make N independent requests instead of one batch. That's the cost; we acknowledge it.
- **High-volume cross-pillar sites get extra scrutiny.** If a page makes 5+ cross-pillar reads, consider:
  - Combining into a single aggregator call (PRD-198 search orchestrator pattern)
  - Caching aggressively (React Query staleTime tuning)
  - Lazy loading sections (defer until in-viewport)

## Edge Cases

| Case                                                                                             | Behaviour                                                               |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Cross-pillar call is unavoidable (e.g. dashboard widget needs finance + media)                   | Document; accept N separate requests.                                   |
| Audit finds a call to a soon-to-be-renamed namespace (e.g. `core.tagRules` → `finance.tagRules`) | Note the future rename; defer the audit entry's resolution to Epic 08a. |

## User Stories

| #   | Story                                                       | Summary                                                                                                      |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 01  | [us-01-grep-audit](us-01-grep-audit.md)                     | Scan every shell + app-package source file for `trpc.<pillar>.*` calls; emit per-file report                 |
| 02  | [us-02-classify-call-sites](us-02-classify-call-sites.md)   | For each cross-pillar site, classify: single-pillar / cross-pillar-documented / cross-pillar-refactor-needed |
| 03  | [us-03-refactor-high-volume](us-03-refactor-high-volume.md) | Refactor the 3-5 highest-volume cross-pillar pages (likely Dashboard, Cerebrum context view, etc.)           |
| 04  | [us-04-write-audit-report](us-04-write-audit-report.md)     | Final report committed alongside this PRD                                                                    |

## Out of Scope

- General performance optimisation. Only batch-related concerns.
- Server-side aggregator endpoints (Epic 08b's search orchestrator).
- Component-level refactors beyond batching.

## Acceptance Criteria

- [x] Audit script at `scripts/audit/batch-call-sites.ts` scans `apps/pops-shell/src/**/*.{ts,tsx}` and `packages/app-*/src/**/*.{ts,tsx}` for tRPC call sites (`trpc.<pillar>.<...>` and `utils.<pillar>.<...>` from `trpc.useUtils()`).
- [x] Sites are grouped per file by inferred pillar (first path segment) and any file mixing calls from ≥2 pillars is flagged as a potential cross-pillar batch.
- [x] Inventory committed at [`inventory.md`](./inventory.md), regeneratable via `pnpm tsx scripts/audit/batch-call-sites.ts --write docs/themes/13-pillar-finale/prds/189-batch-call-site-audit/inventory.md`.
- [x] Parser/grouping logic covered by [`scripts/audit/__tests__/batch-call-sites.test.ts`](../../../../../scripts/audit/__tests__/batch-call-sites.test.ts).
- [ ] Each flagged cross-pillar site has a follow-up PR resolving it (refactor) or documenting it as accepted (deferred — handled per-site in subsequent PRs).
