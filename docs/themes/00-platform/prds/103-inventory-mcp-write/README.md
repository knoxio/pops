# PRD-103: Inventory MCP Write Tools

> Theme: [00 — Platform](../../README.md)
> Epic: [03 — MCP Interface](../../epics/03-mcp-interface.md)
> Status: Done

## Overview

Extends the pops-mcp server with write (create/update/delete) tools for the inventory domain — locations, items, and item-item connections. All tools are pure MCP adapters: they forward input directly to existing pops-api tRPC mutations, with no business logic in the MCP layer.

## Motivation

Add write (create/update/delete) MCP adapters for inventory domain entities — locations, items, and item-item connections — that forward input to existing pops-api tRPC mutations with no business logic in the MCP layer.

## Tool Surface (8 tools)

| Tool name                          | tRPC call                          | Description                     |
| ---------------------------------- | ---------------------------------- | ------------------------------- |
| `inventory.locations.create`       | `inventory.locations.create`       | Create a location node          |
| `inventory.locations.update`       | `inventory.locations.update`       | Update name / parentId / notes  |
| `inventory.locations.delete`       | `inventory.locations.delete`       | Delete location (stats / force) |
| `inventory.items.create`           | `inventory.items.create`           | Create an inventory item        |
| `inventory.items.update`           | `inventory.items.update`           | Update item fields (partial)    |
| `inventory.items.delete`           | `inventory.items.delete`           | Delete an item                  |
| `inventory.connections.connect`    | `inventory.connections.connect`    | Create item-item connection     |
| `inventory.connections.disconnect` | `inventory.connections.disconnect` | Remove item-item connection     |

## Architecture

Tools are organized into domain-specific modules for locations, items, and connections, with a thin aggregator that composes them. Each module owns both its read and write tools.

## Business Rules

- All endpoints require the MCP service-account key for authentication.
- `locations.delete` returns `{ requiresConfirmation: true, stats }` (not an error) when the location has children or items and `force` is not set.
- `items.update` and `locations.update` use nullable field semantics: passing `null` clears the field; omitting the key is a no-op.
- tRPC errors (NOT_FOUND, CONFLICT, etc.) propagate through the MCP SDK's tool handler error path.

## User Stories

| US    | Title                           | Status |
| ----- | ------------------------------- | ------ |
| US-01 | Location & item write tools     | Done   |
| US-02 | Connection write tools & barrel | Done   |
