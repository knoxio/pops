# Epic 03: MCP Interface

> Theme: [00 — Platform](../README.md)
> Status: In progress

## Summary

A standalone HTTP service (`pops-mcp`) that exposes POPS data through the Model Context Protocol. AI agents on the local network can query finance, media, inventory, and Cerebrum knowledge-base data using standard MCP tool calls.

## Scope

**In scope:**

- HTTP MCP server (`POST /mcp`, Streamable HTTP transport, stateless)
- Tool surface for Inventory (locations, items, connections), Finance (transactions, entities, budgets), Media (library, watchlist), and Cerebrum (engrams, search)
- Docker Compose integration (`--profile mcp`) for both dev and production
- Local network port exposure (port 3002, `0.0.0.0` bind)
- Service-account API key auth to pops-api

**Out of scope:**

- Authentication of MCP clients (callers on the local network are trusted)
- Cloudflare Tunnel exposure (manual add-on if needed)

## PRDs

| PRD                                                  | Summary                                                          | Status      |
| ---------------------------------------------------- | ---------------------------------------------------------------- | ----------- |
| [PRD-102](../prds/102-mcp-server/README.md)          | HTTP MCP server, read-only domain tools, Docker packaging        | In progress |
| [PRD-103](../prds/103-inventory-mcp-write/README.md) | Inventory MCP write tools (locations, items, connections — CRUD) | Done        |
| [PRD-105](../prds/105-fixture-mcp-tools/README.md)   | Fixture MCP tools (fixture CRUD + item-fixture connections)      | Done        |

**Dependencies:** PRD-102 requires pops-api to be running and a service-account API key provisioned (shared with moltbot). No other PRDs depend on this epic.

**Parallelization:** PRD-102 user stories can mostly run in parallel — tool implementation (US-02 through US-05) is independent of Docker packaging (US-06) and CI publishing (US-08). The HTTP server entry point (US-01) must land first as other stories build on it. Tests (US-07) can be written alongside tool implementation.

## Key Decisions

| Decision         | Choice                                            | Rationale                                                           |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| Architecture     | Standalone service calling pops-api via tRPC      | Clean separation; pops-api is the source of truth                   |
| Transport        | MCP Streamable HTTP (stateless)                   | Supports any MCP client; no session management overhead             |
| Auth to pops-api | `X-API-Key` service account (shared with moltbot) | Reuses existing secret; no new provisioning needed                  |
| Network          | `pops-backend` only, port 3002 exposed            | LAN access without Cloudflare; intentionally not on `pops-frontend` |
| Opt-in profile   | `--profile mcp`                                   | Not all deployers need MCP; avoids pulling the image unnecessarily  |
