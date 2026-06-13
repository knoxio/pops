# PRD-204: Shell call-site migration

> Epic: [Reclaim misnamed finance code](../../epics/08a-reclaim-misnamed-finance.md)

## Overview

Update every `trpc.core.corrections.*` and `trpc.core.tagRules.*` reference in the shell + finance app package to `trpc.finance.corrections.*` and `trpc.finance.tagRules.*`. Companion PR to PRD-203 (the directory move + namespace rename).

## Data Model

No data. Source-only.

## API Surface

Audit targets:

- `apps/pops-shell/src/**/*.{ts,tsx}` — UI consumers
- `packages/app-finance/src/**/*.{ts,tsx}` — finance app package
- React Query keys derived from procedure paths

Standard substitutions:

- `trpc.core.corrections.` → `trpc.finance.corrections.`
- `trpc.core.tagRules.` → `trpc.finance.tagRules.`
- React Query keys: `['core', 'corrections', ...]` → `['finance', 'corrections', ...]`

## Business Rules

- **One PR for the shell + app-finance migration.** Keeps the change atomic.
- **No compat aliases.** Breaking change; eaten at once.
- **React Query keys updated alongside paths** to avoid cache key drift on existing sessions (sessions get a forced cache reset via the version bump).

## Edge Cases

| Case                                           | Behaviour                                |
| ---------------------------------------------- | ---------------------------------------- |
| Code references the old path via string concat | Caught manually during audit; rewritten. |
| Test fixture uses old namespace                | Updated alongside source.                |
| Hardcoded URL in nginx vhost                   | Caught by PRD-206's dispatcher review.   |

## Inventory

The per-call-site audit (file, line, pillar.router.proc, query/mutation kind, hook, call shape, migration category) lives in [inventory.md](./inventory.md). The inventory is the source of truth for the per-PR split — read it before scheduling any of the user stories below.

## User Stories

| #   | Story                                               | Summary                                                               |
| --- | --------------------------------------------------- | --------------------------------------------------------------------- |
| 01  | [us-01-grep-shell](us-01-grep-shell.md)             | Find every `trpc.core.{corrections,tagRules}` reference in pops-shell |
| 02  | [us-02-grep-app-finance](us-02-grep-app-finance.md) | Same for packages/app-finance                                         |
| 03  | [us-03-replace-and-test](us-03-replace-and-test.md) | Replace, run typecheck + E2E                                          |
| 04  | [us-04-query-key-update](us-04-query-key-update.md) | React Query keys update + cache invalidation note                     |

## Out of Scope

- MCP / CLI (PRD-205).
- Backward compat layer.
- API name changes beyond the namespace rename.
