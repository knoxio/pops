# PRD-105: Fixture MCP Tools

> Theme: [00 — Platform](../../README.md)
> Epic: [03 — MCP Interface](../../epics/03-mcp-interface.md)
> Status: Done

## Overview

Exposes the fixtures domain (PRD-104) through the MCP server as 8 tools covering full CRUD for fixtures and item-fixture connections. All tools are thin adapters over pops-api tRPC endpoints.

## Tool Surface (8 tools)

| Tool name                        | tRPC call                        | Description                                |
| -------------------------------- | -------------------------------- | ------------------------------------------ |
| `inventory.fixtures.list`        | `inventory.fixtures.list`        | List fixtures with locationId/type filters |
| `inventory.fixtures.get`         | `inventory.fixtures.get`         | Get a single fixture by ID                 |
| `inventory.fixtures.create`      | `inventory.fixtures.create`      | Create a new fixture                       |
| `inventory.fixtures.update`      | `inventory.fixtures.update`      | Update fixture fields (partial, nullable)  |
| `inventory.fixtures.delete`      | `inventory.fixtures.delete`      | Delete a fixture (cascades connections)    |
| `inventory.fixtures.connect`     | `inventory.fixtures.connect`     | Connect an item to a fixture               |
| `inventory.fixtures.disconnect`  | `inventory.fixtures.disconnect`  | Disconnect an item from a fixture          |
| `inventory.fixtures.listForItem` | `inventory.fixtures.listForItem` | List all fixture connections for an item   |

## Architecture

- `apps/pops-mcp/src/tools/inventory-fixtures.ts` — all 8 tools, must stay under 200 lines
- `apps/pops-mcp/src/tools/index.ts` — `fixtureTools` imported and spread into `allTools`
- `apps/pops-mcp/src/tools/inventory-fixtures.test.ts` — unit tests using `mockClient.inventory.fixtures.*`
- `apps/pops-mcp/src/tools/index.test.ts` — tool count updated from 14 → 22 (30 once PRD-103 merges)

## Business Rules

- `fixtures.update` uses nullable field semantics: passing `null` for `locationId` or `notes` clears the field; omitting is a no-op.
- `fixtures.delete` propagates the cascade silently — no confirmation flow needed (fixtures are not owned assets).
- Error propagation: NOT_FOUND and CONFLICT tRPC errors surface through MCP as thrown errors (handled by MCP SDK).

## User Stories

| US    | Title                         | Status |
| ----- | ----------------------------- | ------ |
| US-01 | Fixture CRUD tools            | Done   |
| US-02 | Item-fixture connection tools | Done   |
