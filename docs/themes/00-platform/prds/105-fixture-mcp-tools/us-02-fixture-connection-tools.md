# US-02: Item-fixture connection tools

> PRD: [PRD-105 — Fixture MCP Tools](README.md)
> Status: Done

## Goal

Add connect, disconnect, and listForItem tools to `inventory-fixtures.ts`, wire the barrel, update the tool count test, and complete unit test coverage for all 8 fixture tools.

## Acceptance Criteria

- [x] `inventory.fixtures.connect` — accepts `itemId`, `fixtureId`; calls `client.inventory.fixtures.connect.mutate`
- [x] `inventory.fixtures.disconnect` — accepts `itemId`, `fixtureId`; calls `client.inventory.fixtures.disconnect.mutate`
- [x] `inventory.fixtures.listForItem` — accepts `itemId`, `limit?`, `offset?`; calls `client.inventory.fixtures.listForItem.query`
- [x] `apps/pops-mcp/src/tools/inventory.ts` — spreads `fixtureTools` alongside `locationTools`, `itemTools`, `connectionTools`
- [x] `apps/pops-mcp/src/tools/index.test.ts` — tool count assertion updated from 22 to 30
- [x] `inventory-fixtures.test.ts` — tests for connect, disconnect, listForItem; covers CONFLICT/NOT_FOUND propagation
- [x] Full test suite green (`pnpm test` in `apps/pops-mcp`)
