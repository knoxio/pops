# PRD-102: MCP Server — AI Agent Interface

> Theme: [00 — Platform](../../README.md)
> Status: In progress

## Overview

`pops-mcp` is a standalone HTTP service that exposes POPS data through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). It allows AI agents (Claude Desktop, Claude Code, and any MCP-capable client) to query finance, media, inventory, and Cerebrum knowledge-base data over the local network.

The server runs as a Docker Compose service (`--profile mcp`), calls pops-api via tRPC using a service-account API key, and exposes a `POST /mcp` endpoint using the MCP Streamable HTTP transport. It is stateless — no session management, no shared in-memory state.

## Motivation

- **AI clients need structured access to POPS data.** Without MCP, agents can only call the tRPC API directly (requiring auth knowledge and raw HTTP calls).
- **Local network exposure.** The server binds to `0.0.0.0:3002` so any LAN device (iPad, MacBook, Claude Desktop) can query POPS data through an AI interface without going through Cloudflare.
- **Clean separation.** pops-mcp is intentionally thin — it translates MCP requests into tRPC calls and formats results for LLM consumption. All business logic stays in pops-api.

## Architecture

```
AI client (Claude Desktop / Claude Code / any MCP client)
    │  POST /mcp  (MCP Streamable HTTP, port 3002)
    ▼
pops-mcp (apps/pops-mcp)
    │  tRPC over HTTP, X-API-Key auth
    ▼
pops-api (apps/pops-api, port 3000)
    │
    ▼
SQLite database
```

Both services run in the `pops-backend` Docker network. pops-mcp is on that network only — it does not join `pops-frontend`, so Cloudflare Tunnel does not expose it by default. Direct port binding (`0.0.0.0:3002`) provides local network access.

## Tool Surface (14 tools)

| Domain    | Tool name                     | Description                                |
| --------- | ----------------------------- | ------------------------------------------ |
| Inventory | `inventory.locations.tree`    | Full location hierarchy (nested)           |
| Inventory | `inventory.locations.list`    | Flat location list                         |
| Inventory | `inventory.items.list`        | Items with search/location/type filters    |
| Inventory | `inventory.items.get`         | Single item by ID                          |
| Inventory | `inventory.connections.list`  | Connections for an item                    |
| Inventory | `inventory.connections.graph` | Connection graph (nodes + edges)           |
| Finance   | `finance.transactions.list`   | Transactions with date/entity/type filters |
| Finance   | `finance.entities.list`       | Entities (merchants) with search           |
| Finance   | `finance.budgets.list`        | Budgets with period/active filters         |
| Media     | `media.library.list`          | Library (movies + TV) with search/genre    |
| Media     | `media.watchlist.list`        | Watchlist with media type filter           |
| Cerebrum  | `cerebrum.engrams.list`       | Engrams with scope/tag/search filters      |
| Cerebrum  | `cerebrum.engrams.get`        | Single engram by ID                        |
| Cerebrum  | `cerebrum.search`             | Hybrid semantic + structured search        |

## User Stories

| US    | Title                        | Status      |
| ----- | ---------------------------- | ----------- |
| US-01 | HTTP MCP server entry point  | Done        |
| US-02 | Inventory tools              | Done        |
| US-03 | Finance tools                | Done        |
| US-04 | Media tools                  | Done        |
| US-05 | Cerebrum tools               | Done        |
| US-06 | Docker image + compose entry | Done        |
| US-07 | Tool handler tests           | In progress |
| US-08 | CI publish pipeline          | Pending     |

## Configuration

| Env var             | Default                 | Description                                  |
| ------------------- | ----------------------- | -------------------------------------------- |
| `POPS_API_URL`      | `http://localhost:3000` | URL of the pops-api instance                 |
| `POPS_API_KEY`      | —                       | Service-account API key (plain text)         |
| `POPS_API_KEY_FILE` | —                       | Path to API key file (Docker secret pattern) |
| `MCP_PORT`          | `3002`                  | Port the HTTP server listens on              |
| `MCP_BIND_ADDR`     | `0.0.0.0`               | Bind address for port exposure in compose    |

## Prerequisites

1. **pops-api must be running** — pops-mcp is a tRPC client, not a standalone data source.
2. **A service-account API key** — provision one via pops-api admin UI → Service Accounts. Store it at `secrets/pops_api_key` (the same file moltbot uses; they can share it).

## Non-goals

- Write access to any domain (this version is read-only for finance/media/inventory; Cerebrum engram writes are not exposed).
- Authentication of MCP clients — callers on the local network are trusted. Add a reverse proxy if you need client auth.
- Cloudflare Tunnel exposure — intentionally omitted from `pops-frontend` network. Add manually if needed.
