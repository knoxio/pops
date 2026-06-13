# PRD-204: Shell call-site migration

> Epic: [Reclaim misnamed finance code](../../epics/08a-reclaim-misnamed-finance.md)

## Overview

Migrate every `trpc.*` call site under `apps/pops-shell/src/` (and the finance app package) off the mono `@pops/api` tRPC client onto the per-pillar `pillar('<id>')` proxy from `@pops/pillar-sdk`. Covers the original finance-namespace rename (`trpc.core.{corrections,tagRules}` → `trpc.finance.*`) as a subset, plus every other shell call site catalogued in [inventory.md](./inventory.md).

## Data Model

No data. Source-only.

## API Surface

Audit targets:

- `apps/pops-shell/src/**/*.{ts,tsx}` — UI consumers
- `packages/app-finance/src/**/*.{ts,tsx}` — finance app package
- React Query keys derived from procedure paths

Standard substitutions (per call-site category — see inventory rubric):

- Trivial: `trpc.<pillar>.<router>.<proc>.useQuery(...)` → `pillar('<pillar>').<router>.<proc>.useQuery(...)` (and `useMutation` equivalent).
- Medium: same shape, plus reconciling the provider swap (`App.tsx`), redundant manual `utils.*.invalidate` calls, and option-surface verification for hooks with custom `refetchInterval` / `retry` / `staleTime`.
- Risky: dynamic procedure-path traversal via `utils.client` (`useTestActionHandler`, `useTrpcOptionsLoaders`) — blocked until the SDK exposes a string-path call affordance.
- Finance rename subset: `trpc.core.{corrections,tagRules}.` → `trpc.finance.{corrections,tagRules}.` plus React Query keys `['core', '<router>', ...]` → `['finance', '<router>', ...]`.

## Business Rules

- **Split by feature area, not per file.** See the inventory's "Files with > 5 call sites" section — no file is large enough to warrant a per-file PR; the natural split is foundational, features-page, settings, NudgeIndicator, and the risky dynamic-traversal cluster.
- **No compat aliases.** Breaking change; eaten at once per slice.
- **React Query keys updated alongside paths** to avoid cache key drift on existing sessions (sessions get a forced cache reset via the version bump).

## Edge Cases

| Case                                           | Behaviour                                             |
| ---------------------------------------------- | ----------------------------------------------------- |
| Code references the old path via string concat | Caught manually during audit; rewritten.              |
| Test fixture uses old namespace                | Updated alongside source.                             |
| Hardcoded URL in nginx vhost                   | Caught by PRD-206's dispatcher review.                |
| Dynamic procedure-path traversal               | Blocked on a new SDK affordance — see inventory PR-E. |

## Inventory

The per-call-site audit (file, line, pillar.router.proc, query/mutation kind, hook, call shape, migration category) lives in [inventory.md](./inventory.md). The inventory is the source of truth for the PR split — read it before scheduling any of the user stories below.

## User Stories

| #   | Story                                               | Summary                                           |
| --- | --------------------------------------------------- | ------------------------------------------------- |
| 01  | [us-01-grep-shell](us-01-grep-shell.md)             | Find every `trpc.*` reference in pops-shell       |
| 02  | [us-02-grep-app-finance](us-02-grep-app-finance.md) | Same for packages/app-finance                     |
| 03  | [us-03-replace-and-test](us-03-replace-and-test.md) | Replace, run typecheck + E2E                      |
| 04  | [us-04-query-key-update](us-04-query-key-update.md) | React Query keys update + cache invalidation note |

## Out of Scope

- MCP / CLI (PRD-205).
- Backward compat layer.
- API name changes beyond the SDK rename.
