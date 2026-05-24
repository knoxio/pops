# PRD-103: Inventory MCP Write Tools

> Epic: [Fixtures & MCP Interface](../../epics/06-fixtures-mcp-interface.md)

## Overview

Add 8 write tools to `pops-mcp` for locations, items, and item-item connections. All tRPC mutations already exist in `pops-api` — this PRD is purely an MCP adapter layer. No backend changes required.

## API Surface

All tools live in `apps/pops-mcp/src/tools/inventory.ts` and are appended to the `inventoryTools` export. All call tRPC mutations via `getClient()`.

### Locations

| Tool                         | tRPC call                           | Required input | Optional input                  |
| ---------------------------- | ----------------------------------- | -------------- | ------------------------------- |
| `inventory.locations.create` | `inventory.locations.create.mutate` | `name`         | `parentId`, `sortOrder`         |
| `inventory.locations.update` | `inventory.locations.update.mutate` | `id`           | `name`, `parentId`, `sortOrder` |
| `inventory.locations.delete` | `inventory.locations.delete.mutate` | `id`           | `force` (bool, default false)   |

### Items

| Tool                     | tRPC call                       | Required input | Optional input        |
| ------------------------ | ------------------------------- | -------------- | --------------------- |
| `inventory.items.create` | `inventory.items.create.mutate` | `itemName`     | all other item fields |
| `inventory.items.update` | `inventory.items.update.mutate` | `id`           | any item fields       |
| `inventory.items.delete` | `inventory.items.delete.mutate` | `id`           | —                     |

### Item-Item Connections

| Tool                               | tRPC call                                 | Required input       |
| ---------------------------------- | ----------------------------------------- | -------------------- |
| `inventory.connections.connect`    | `inventory.connections.connect.mutate`    | `itemAId`, `itemBId` |
| `inventory.connections.disconnect` | `inventory.connections.disconnect.mutate` | `itemAId`, `itemBId` |

### Item fields (for create/update)

`brand`, `model`, `itemId`, `room`, `location`, `type`, `condition`, `inUse` (bool), `deductible` (bool), `purchaseDate` (ISO date string), `warrantyExpires` (ISO date string), `replacementValue`, `resaleValue`, `purchasePrice` (numbers), `purchasedFromName`, `assetId`, `notes`, `locationId`

## Business Rules

- `inventory.connections.connect` and `disconnect` accept IDs in any order — the tRPC layer normalises A < B ordering.
- `inventory.locations.delete` without `force: true` returns `{ requiresConfirmation: true, stats }` when the location has children or items. Claude must surface this to the user and re-call with `force: true` to proceed.
- `inventory.locations.delete` with `force: true` cascade-deletes child locations; items in those locations have `locationId` set to null (they become unlocated, not deleted).

## Edge Cases

| Case                                                     | Behaviour                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| `locations.delete` on non-empty location without `force` | Returns `requiresConfirmation: true` with child/item counts — not an error |
| `connections.connect` on already-connected pair          | tRPC throws CONFLICT → MCP returns `isError: true` with message            |
| `connections.disconnect` on non-existent link            | tRPC throws NOT_FOUND → MCP returns `isError: true`                        |
| `items.update` with no data fields                       | tRPC applies no changes, returns current item — not an error               |
| Either ID missing or empty string on required fields     | MCP validates and returns `isError: true` before calling tRPC              |

## User Stories

| #   | Story                                               | Summary                                     | Parallelisable |
| --- | --------------------------------------------------- | ------------------------------------------- | -------------- |
| 01  | [us-01-location-write](us-01-location-write.md)     | Location create/update/delete tools + tests | Yes            |
| 02  | [us-02-item-write](us-02-item-write.md)             | Item create/update/delete tools + tests     | Yes            |
| 03  | [us-03-connection-write](us-03-connection-write.md) | Connection connect/disconnect tools + tests | Yes            |

All three user stories are fully independent and can be built in parallel.

## Out of Scope

- Fixture connections (PRD-105)
- tRPC router changes — mutations already exist
- pops-api module manifest `aiTools` slot — this targets `pops-mcp` only
