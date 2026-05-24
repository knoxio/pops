# US-01: Fixture CRUD tools

> PRD: [PRD-105 — Fixture MCP Tools](README.md)
> Status: Done

## Goal

Implement MCP tools for fixture list, get, create, update, and delete in `inventory-fixtures.ts`, with full unit test coverage.

## Acceptance Criteria

- [x] `apps/pops-mcp/src/tools/inventory-fixtures.ts` — exports `fixtureTools: ToolDef[]` containing 8 tools
- [x] `inventory.fixtures.list` — accepts `locationId?`, `type?`, `limit?`, `offset?`; calls `client.inventory.fixtures.list.query`
- [x] `inventory.fixtures.get` — accepts `id` (required); calls `client.inventory.fixtures.get.query`
- [x] `inventory.fixtures.create` — accepts `name`, `type`, `locationId?`, `notes?`; calls `client.inventory.fixtures.create.mutate`
- [x] `inventory.fixtures.update` — accepts `id`, `name?`, `type?`, `locationId?` (nullable), `notes?` (nullable); uses `nullStr`; calls `client.inventory.fixtures.update.mutate`
- [x] `inventory.fixtures.delete` — accepts `id`; calls `client.inventory.fixtures.delete.mutate`
- [x] `inventory-fixtures.test.ts` — unit tests for all 5 CRUD tools covering happy path and error propagation
- [x] File stays under 200 lines
- [x] Pre-commit lint + typecheck pass
