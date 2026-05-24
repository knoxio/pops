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

- Write access via MCP (read-only)
- Authentication of MCP clients (callers on the local network are trusted)
- Cloudflare Tunnel exposure (manual add-on if needed)

## PRDs

| PRD                                         | Summary                                             | Status      |
| ------------------------------------------- | --------------------------------------------------- | ----------- |
| [PRD-102](../prds/102-mcp-server/README.md) | HTTP MCP server, all domain tools, Docker packaging | In progress |

## Key Decisions

| Decision         | Choice                                            | Rationale                                                           |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| Architecture     | Standalone service calling pops-api via tRPC      | Clean separation; pops-api is the source of truth                   |
| Transport        | MCP Streamable HTTP (stateless)                   | Supports any MCP client; no session management overhead             |
| Auth to pops-api | `X-API-Key` service account (shared with moltbot) | Reuses existing secret; no new provisioning needed                  |
| Network          | `pops-backend` only, port 3002 exposed            | LAN access without Cloudflare; intentionally not on `pops-frontend` |
| Opt-in profile   | `--profile mcp`                                   | Not all deployers need MCP; avoids pulling the image unnecessarily  |
