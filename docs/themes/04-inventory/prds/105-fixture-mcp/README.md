# PRD-105: Fixture MCP Tools

> Epic: [Fixtures & MCP Interface](../../epics/06-fixtures-mcp-interface.md)

## Overview

Expose the fixtures domain to Claude via MCP tools. Together with PRD-103 (item/location write tools), this completes the full home walkthrough capability: the user can describe outlets, ports, and wall panels, then connect their owned items to them.

## API Surface

All tools are added to `apps/pops-mcp/src/tools/inventory.ts` and appended to `inventoryTools`.

### Fixture CRUD

| Tool                        | tRPC call                          | Required | Optional                                          |
| --------------------------- | ---------------------------------- | -------- | ------------------------------------------------- |
| `inventory.fixtures.list`   | `inventory.fixtures.list.query`    | —        | `search`, `locationId`, `type`, `limit`, `offset` |
| `inventory.fixtures.get`    | `inventory.fixtures.get.query`     | `id`     | —                                                 |
| `inventory.fixtures.create` | `inventory.fixtures.create.mutate` | `name`   | `type`, `locationId`, `notes`                     |
| `inventory.fixtures.update` | `inventory.fixtures.update.mutate` | `id`     | `name`, `type`, `locationId`, `notes`             |
| `inventory.fixtures.delete` | `inventory.fixtures.delete.mutate` | `id`     | —                                                 |

### Item-Fixture Connections

| Tool                             | tRPC call                              | Required              |
| -------------------------------- | -------------------------------------- | --------------------- |
| `inventory.fixtures.connect`     | `inventory.fixtures.connect.mutate`    | `itemId`, `fixtureId` |
| `inventory.fixtures.disconnect`  | `inventory.fixtures.disconnect.mutate` | `itemId`, `fixtureId` |
| `inventory.fixtures.listForItem` | `inventory.fixtures.listForItem.query` | `itemId`              |

## Business Rules

- `inventory.fixtures.delete` does not require confirmation — deleting a fixture removes only the connection rows; owned items are untouched. This is intentional: house-move workflow is `DELETE all fixtures` → re-create for new house → re-connect.
- `inventory.connections.graph` (existing tool) already returns fixture nodes after PRD-104 extends the tRPC service — no changes needed to that MCP tool.
- `inventory.fixtures.create` returns the full fixture object including `id` so Claude can immediately use it for connections.

## Edge Cases

| Case                                                    | Behaviour                                  |
| ------------------------------------------------------- | ------------------------------------------ |
| `fixtures.delete` on fixture with connected items       | tRPC cascades connections; returns success |
| `fixtures.connect` on already-connected pair            | tRPC CONFLICT → `isError: true`            |
| `fixtures.connect` with unknown `itemId` or `fixtureId` | tRPC NOT_FOUND → `isError: true`           |
| `fixtures.list` with no results                         | Returns empty array, not an error          |

## User Stories

| #   | Story                                                               | Summary                                         | Parallelisable      |
| --- | ------------------------------------------------------------------- | ----------------------------------------------- | ------------------- |
| 01  | [us-01-fixture-crud-tools](us-01-fixture-crud-tools.md)             | list, get, create, update, delete tools + tests | Yes (after PRD-104) |
| 02  | [us-02-fixture-connection-tools](us-02-fixture-connection-tools.md) | connect, disconnect, listForItem tools + tests  | Yes (after PRD-104) |

Both user stories can be built in parallel once PRD-104 is complete.

## Out of Scope

- Fixture-to-fixture connections
- Fixture graph traversal beyond what the extended `connections.graph` already provides
- Bulk fixture creation
