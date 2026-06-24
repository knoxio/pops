# Epic: MCP Interface

> Theme: [Platform](../README.md)
> Status: Done

## Summary

A standalone HTTP gateway (`@pops/mcp`) that exposes the POPS fleet through the Model Context Protocol. AI agents on the local network query inventory, finance, media, and Cerebrum data — read and write — using standard MCP tool calls, while the gateway dispatches each call to the owning pillar over REST through the `@pops/pillar-sdk` `pillar()` client.

## Scope

**In scope:**

- HTTP MCP server (`POST /mcp`, Streamable HTTP transport, stateless)
- Tool surface for Inventory (locations, items, item↔item connections, fixtures — full CRUD), Finance (transactions, entities, budgets), Media (library, watchlist), and Cerebrum (engrams, search)
- Pillar dispatch over REST via the pillar SDK, with per-pillar URL pinning and registry-backed discovery fallback
- Docker Compose integration (`--profile mcp`) for both dev and production
- Local network port exposure (port 3002, `0.0.0.0` bind)
- Service-account key auth from the gateway to the pillars

**Out of scope:**

- Authentication of MCP clients (callers on the local network are trusted)
- Cross-pillar orchestration / federated search (lives in the orchestrator pillar)
- Cloudflare Tunnel exposure (manual add-on if needed)

## PRDs

| PRD                                        | Summary                                                                                                                                                            | Status |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| [MCP Server](../prds/mcp-server/README.md) | HTTP MCP gateway: transport, discovery/auth, 30-tool catalogue (inventory + fixtures full CRUD, finance, media, cerebrum), health, container packaging, CI publish | Done   |

The exhaustive per-tool surface lives in the in-pillar [MCP Tool Inventory](../../../../pillars/mcp/docs/prds/tool-inventory/README.md).

**Dependencies:** the gateway requires its target pillars (inventory, finance, contacts, media, cerebrum) and the registry to be reachable, plus a service-account key. No other PRDs depend on this epic.

## Key Decisions

| Decision        | Choice                                                                      | Rationale                                                                      |
| --------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Architecture    | Thin gateway dispatching to pillars over REST via `@pops/pillar-sdk`        | One discovery + auth path; no per-pillar HTTP plumbing; pillars own all logic  |
| Transport       | MCP Streamable HTTP (stateless)                                             | Supports any MCP client; server + transport per request, no session state      |
| Auth to pillars | Service-account key (`POPS_INTERNAL_API_KEY`, legacy `POPS_API_KEY`)        | Single outbound credential; inbound MCP is LAN-trusted                         |
| Entity source   | `finance.entities.list` reads the `contacts` pillar                         | Contacts is the authoritative entity store; finance owns only the usage rollup |
| Failure mapping | Every SDK `CallResult` failure → MCP `isError: true` with a readable reason | The model reads the reason and self-corrects instead of crashing the call      |
| Network         | `backend` network only, port 3002 exposed                                   | LAN access without Cloudflare; intentionally not on the frontend network       |
| Opt-in profile  | `--profile mcp`                                                             | Not all deployers need MCP; avoids pulling the image unnecessarily             |
