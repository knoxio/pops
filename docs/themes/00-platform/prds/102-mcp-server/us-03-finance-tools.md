# US-03: Finance tools

> PRD: [PRD-102 — MCP Server](README.md)
> Status: Done

## Goal

Expose finance transactions, entities (merchants), and budgets as MCP tools.

## Acceptance Criteria

- [x] `finance.transactions.list` — accepts `search`, `startDate`, `endDate`, `entityId`, `account`, `type`, `limit`, `offset`; calls `finance.transactions.list`
- [x] `finance.entities.list` — accepts `search`, `type`, `limit`, `offset`; calls `core.entities.list` (entities live under the `core` router)
- [x] `finance.budgets.list` — accepts `search`, `period`, `active`, `limit`, `offset`; calls `finance.budgets.list`
- [x] `type` enum for transactions is restricted to `income | expense | transfer`
- [x] `period` enum for budgets is restricted to `monthly | yearly`
- [x] `active` for budgets is passed as string `"true" | "false"` (matching the tRPC schema)
