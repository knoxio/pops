# MCP Gateway (`@pops/mcp`)

> Expose every POPS pillar capability to AI agents over the Model Context Protocol.

## Strategic Objective

`@pops/mcp` is the single MCP entry point into the POPS fleet. It is an HTTP MCP server that advertises a flat catalogue of tools — inventory, finance, media, cerebrum — and dispatches each call to the owning pillar over REST via the `@pops/pillar-sdk` `pillar()` client. Any MCP-capable agent (Claude Desktop, Claude Code, any MCP client on the LAN) points at one URL and gets typed, read-and-write access to the whole platform without learning each pillar's REST contract or holding pillar credentials.

The gateway is intentionally thin: it owns no database and no business logic. Every tool is an adapter that translates an MCP `CallToolRequest` into a typed pillar SDK call, then normalises the SDK `CallResult` into an MCP `CallToolResult`. All data, validation, and mutation logic stay in the pillars.

## Shape

- **Transport.** Streamable HTTP, stateless. Agents `POST /mcp`; a fresh `Server` + `StreamableHTTPServerTransport` is created per request and torn down on response close (no session state, no shared in-memory cursor).
- **Port.** `3002` (override with `MCP_PORT`), bound `0.0.0.0` for LAN reach.
- **Pillar access.** Tools call pillars through `getPillar<TRouter>(id)` (`src/pillar-client.ts`), a thin wrapper over `@pops/pillar-sdk` `pillar()`. The SDK is configured once at module load with a service-account key and a map of Docker-internal pillar base URLs; it memoises per-pillar handles. Discovery falls back through the registry pillar when an internal hostname is not pinned.
- **Auth.** Outbound only. The gateway authenticates to pillars with a service-account key read from `POPS_INTERNAL_API_KEY` (or legacy `POPS_API_KEY`, optionally via the `POPS_API_KEY_FILE` Docker-secret pattern). Inbound MCP connections are unauthenticated — callers on the LAN are trusted; front a reverse proxy if client auth is required.
- **Packaging.** A container (`Dockerfile`) building `@pops/mcp` and `@pops/pillar-sdk` into a standalone Node image, exposing `3002`. Liveness is `GET /health`; readiness is `GET /ready` (503 until a service-account key is present).

## Tool families

| Family                                      | Pillar                | Tools |
| ------------------------------------------- | --------------------- | ----- |
| Inventory — locations / items / connections | `inventory`           | 14    |
| Inventory — fixtures                        | `inventory`           | 8     |
| Finance — transactions / entities / budgets | `finance`, `contacts` | 3     |
| Media — library / watchlist                 | `media`               | 2     |
| Cerebrum — engrams / search                 | `cerebrum`            | 3     |

Full per-tool surface, rules, and edge cases: [Tool Inventory PRD](prds/tool-inventory.md). Gateway plumbing (transport, lifecycle, container, CI publish, config) is the central platform spec — see [MCP Server PRD](../../../docs/themes/platform/prds/mcp-server.md); this tree does not duplicate it.

## Key Decisions

| Decision                  | Choice                                                           | Rationale                                                                                  |
| ------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Pillar transport          | `@pops/pillar-sdk` `pillar()` REST                               | One discovery + auth path; no per-pillar HTTP plumbing in the gateway                      |
| Statelessness             | Server + transport per request                                   | No session affinity; horizontally trivial; nothing to leak between calls                   |
| Failure mapping           | Every SDK failure → MCP `isError: true` with a readable reason   | The model reads the reason and self-corrects or retries instead of crashing the tool call  |
| Entity source for finance | `finance.entities.list` reads the `contacts` pillar              | Contacts is the authoritative entity store; finance only owns the transaction usage rollup |
| Catalogue                 | Flat `allTools` array, namespaced names (`<pillar>.<domain>.op`) | One `ListTools` response; routing is a name lookup                                         |

## Out of Scope

- Inbound MCP client authentication (LAN-trusted; reverse-proxy if needed).
- Cross-pillar orchestration or workflows — each tool is a single pillar call.
- Persisting any state in the gateway — it owns no database.
- Exposing pillars not wired into `allTools` (e.g. lists, registry, orchestrator).
