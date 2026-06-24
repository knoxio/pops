# PRD: MCP Server — AI Agent Gateway

> Theme: [Platform](../../README.md)
> Status: Done
> Pillar tree: [`@pops/mcp` domain overview](../../../../../pillars/mcp/docs/README.md) · per-tool surface: [MCP Tool Inventory](../../../../../pillars/mcp/docs/prds/tool-inventory/README.md)

## Overview

`@pops/mcp` (`pillars/mcp`) is the single [Model Context Protocol](https://modelcontextprotocol.io/) entry point into the POPS fleet. It is a stateless HTTP MCP server that advertises a flat catalogue of tools — inventory, finance, media, cerebrum — and dispatches each call to the owning pillar over REST through the `@pops/pillar-sdk` `pillar()` client. Any MCP-capable agent (Claude Desktop, Claude Code, any MCP client on the LAN) points at one URL and gets typed read-and-write access to the whole platform without learning each pillar's REST contract or holding pillar credentials.

The gateway is intentionally thin: it owns no database and no business logic. Every tool is an adapter that translates an MCP `CallToolRequest` into a typed pillar SDK call and normalises the SDK `CallResult` into an MCP `CallToolResult`. All data, validation, and mutation logic stay in the pillars.

This PRD owns the gateway plumbing — transport, request lifecycle, discovery/auth, health, container packaging, CI publish, and configuration. The exhaustive per-tool surface (every tool name, REST endpoint, required/optional args, and per-family acceptance criteria) lives in the in-pillar [MCP Tool Inventory](../../../../../pillars/mcp/docs/prds/tool-inventory/README.md) and is summarised below.

## Motivation

- **AI clients need structured access to POPS data.** Without MCP, an agent has to call each pillar's REST contract directly — learning every route, holding a service-account key, and reimplementing discovery. The gateway collapses that into one tool catalogue.
- **LAN exposure.** The server binds `0.0.0.0:3002` so any device on the local network (iPad, MacBook, Claude Desktop) can query POPS through an AI interface without going through Cloudflare.
- **Clean separation.** The gateway is an adapter layer: it maps MCP requests to pillar SDK calls and formats results for LLM consumption. All business logic stays in the pillars.

## Architecture

```text
AI client (Claude Desktop / Claude Code / any MCP client)
    │  POST /mcp  (MCP Streamable HTTP, port 3002)
    ▼
@pops/mcp  (gateway — owns no DB)
    │  REST via @pops/pillar-sdk pillar()  (service-account key, per-pillar URLs)
    ▼
pillar APIs:  inventory · finance · contacts · media · cerebrum
    │  (each owns its SQLite DB + ts-rest/zod contract)
    ▼
registry pillar (:3001) — discovery fallback when an internal hostname isn't pinned
```

The gateway joins the `backend` Docker network only — it does not join the frontend network, so Cloudflare Tunnel does not expose it by default. Direct port binding (`0.0.0.0:3002`) provides LAN access. The gateway is a pure **consumer** of pillars and the registry: it does not self-register, does not export a `./manifest`, and advertises no contract of its own.

### Pillar access and discovery

Tools never call `pillar()` directly. They import `getPillar<TRouter>(id)` from `src/pillar-client.ts`, which configures the server SDK once at module load and returns a memoised, fully-typed per-pillar handle:

```ts
import type { AppRouter as InventoryAppRouter } from '@pops/inventory-api/router';
const inventory = getPillar<InventoryAppRouter>('inventory');
await inventory.inventory.locations.list();
```

`configureServerSdk` is seeded with:

- the **service-account key** (`POPS_INTERNAL_API_KEY`, or legacy `POPS_API_KEY`, optionally via the `POPS_API_KEY_FILE` Docker-secret pattern);
- an **`internalBaseUrls` map** pinning Docker-network hostnames per pillar (`inventory-api:3003`, `finance-api:3004`, `registry-api:3001`, `media-api:3005`, `cerebrum-api:3006`, `contacts-api:3010`), each overridable via `POPS_<PILLAR>_API_URL`;
- an optional **registry URL** (`POPS_REGISTRY_URL`) so discovery falls back through the registry pillar when an internal hostname is not pinned.

The SDK memoises per-pillar handles, so repeated `getPillar` calls share a discovery cache.

## Transport & request lifecycle

- **Streamable HTTP, stateless.** Agents `POST /mcp`. A fresh `Server` + `StreamableHTTPServerTransport` (`sessionIdGenerator: undefined`) is created per request and torn down when the response closes — no session affinity, no shared in-memory cursor, nothing to leak between calls.
- **Cleanup is sync-safe.** The `res.on('close')` listener hooks `server.close()` and routes any rejection through `.catch` (an EventEmitter listener cannot be `async` — the emitter would discard the promise and trip `unhandledRejection`). This wiring is exported so a unit test can exercise the rejection path.
- **`ListTools`** returns the flat `allTools` catalogue, each with `name`, `description`, and `inputSchema`.
- **`CallTool`** routes by tool name. Unknown names return `isError: true` ("Unknown tool: …"). Any handler exception is caught and returned as `isError: true` ("Tool error: …") rather than crashing the transport.
- **Failure mapping.** Every pillar SDK `CallResult` failure becomes an MCP `isError: true` with a human-readable reason: `not-found` / `conflict` / `bad-request` / `unauthorized` surface the pillar message; `unavailable` / `degraded` / `contract-mismatch` surface a retry-oriented message naming the pillar. The model reads the reason and self-corrects or retries instead of seeing a hard crash.

## Health & readiness

| Endpoint      | Purpose                                                                                                                                                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health` | Liveness — fast, no upstream calls. Returns `{ status: 'ok', tools: N }`. Drives the Docker `HEALTHCHECK`.                                                                                                                                                                                     |
| `GET /ready`  | Readiness — returns `200 { status: 'ready', apiKeyConfigured: true, tools: N }` when a service-account key is present, else `503 { status: 'degraded', apiKeyConfigured: false, … }`. The missing key is the most common misconfiguration; orchestrators can route around a degraded instance. |

## Tool surface (30 tools)

Flat `allTools` array, namespaced names (`<pillar>.<domain>.op`). Full per-tool detail (REST endpoint, required/optional args, edge cases) is in the [MCP Tool Inventory](../../../../../pillars/mcp/docs/prds/tool-inventory/README.md).

| Family                                      | Owning pillar(s)      | Tools | Operations                                                                          |
| ------------------------------------------- | --------------------- | ----- | ----------------------------------------------------------------------------------- |
| Inventory — locations                       | `inventory`           | 5     | `tree`, `list`, `create`, `update`, `delete`                                        |
| Inventory — items                           | `inventory`           | 5     | `list`, `get`, `create`, `update`, `delete`                                         |
| Inventory — item↔item connections           | `inventory`           | 4     | `list`, `graph`, `connect`, `disconnect`                                            |
| Inventory — fixtures                        | `inventory`           | 8     | `list`, `get`, `listForItem`, `create`, `update`, `delete`, `connect`, `disconnect` |
| Finance — transactions / entities / budgets | `finance`, `contacts` | 3     | `transactions.list`, `entities.list`, `budgets.list`                                |
| Media — library / watchlist                 | `media`               | 2     | `library.list`, `watchlist.list`                                                    |
| Cerebrum — engrams / search                 | `cerebrum`            | 3     | `engrams.list`, `engrams.get`, `search`                                             |

`finance.entities.list` reaches the **`contacts`** pillar — the authoritative entity store — not finance. Finance owns only the transaction-usage rollup; the entity table itself is contacts'.

## Rules

- **Adapter-only.** No tool owns data, validation, or business logic — that lives in the pillar. The gateway never reaches a database directly.
- **Required-arg short-circuit.** Required string IDs (`id`, `itemName`, `name`, `itemAId`, `itemBId`, `itemId`, `fixtureId`, `query`) are validated before any pillar call; missing/empty returns `isError: true` up front.
- **Three-state patch semantics (update tools).** Only keys explicitly present in args are forwarded. Nullable string/number fields forward an explicit `null` to clear a column; non-null fields (`itemName`, `inUse`, `deductible`) drop `null` so a NOT-NULL column can't be nulled. Numbers are validated `typeof === 'number'`, so `0` is a legal value, not "absent".
- **Enum coercion.** Constrained args (`type`, `mode`, `period`, `active`, `mediaType`, entity `type`) are validated against their allowed set and fall back to the default (or are dropped) when invalid, rather than forwarding garbage to the pillar.
- **Array filtering.** Array inputs (`scopes`, `tags`) are filtered to string-only elements before forwarding.
- **Connection ordering.** `connect`/`disconnect` accept item IDs in any order; the inventory pillar enforces canonical ordering server-side.

## Edge cases

| Case                                                               | Behaviour                                                                                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `inventory.locations.delete` on a non-empty location w/o `force`   | `{ requiresConfirmation: true, stats }` passed through as **success** — the model confirms and re-calls with `force: true` |
| `force: true` delete                                               | cascade-deletes child locations; items in them become unlocated (`locationId = null`), not deleted                         |
| `inventory.connections.connect` on an already-linked pair          | pillar conflict → `isError: true` with reason                                                                              |
| `inventory.connections.disconnect` on a missing link               | pillar not-found → `isError: true`                                                                                         |
| `inventory.fixtures.delete`                                        | all item↔fixture connections removed automatically; no confirmation flow (fixtures are not owned assets)                   |
| update tool with no mutable fields present                         | empty patch forwarded; pillar applies no change and returns the current row (not an error)                                 |
| any required ID/name missing or empty                              | `isError: true` returned before the pillar is called                                                                       |
| unknown tool name                                                  | `isError: true` ("Unknown tool: …")                                                                                        |
| handler throws / pillar unavailable / degraded / contract mismatch | `isError: true` with a retry-oriented, pillar-named message; never crashes the transport                                   |

## Configuration

| Env var                  | Default                     | Description                                                                  |
| ------------------------ | --------------------------- | ---------------------------------------------------------------------------- |
| `POPS_INTERNAL_API_KEY`  | —                           | Service-account key the SDK uses to authenticate to pillars                  |
| `POPS_API_KEY`           | —                           | Legacy fallback for the service-account key                                  |
| `POPS_API_KEY_FILE`      | —                           | Path to a key file (Docker-secret pattern); read into the key var at startup |
| `MCP_PORT`               | `3002`                      | Port the HTTP server listens on (bound `0.0.0.0`)                            |
| `MCP_BIND_ADDR`          | `0.0.0.0`                   | Host bind address for the published compose port                             |
| `POPS_REGISTRY_URL`      | —                           | Registry pillar URL for discovery fallback                                   |
| `POPS_INVENTORY_API_URL` | `http://inventory-api:3003` | Pinned Docker-network base URL for the inventory pillar                      |
| `POPS_FINANCE_API_URL`   | `http://finance-api:3004`   | Pinned base URL for the finance pillar                                       |
| `POPS_CONTACTS_API_URL`  | `http://contacts-api:3010`  | Pinned base URL for the contacts pillar (entities)                           |
| `POPS_MEDIA_API_URL`     | `http://media-api:3005`     | Pinned base URL for the media pillar                                         |
| `POPS_CEREBRUM_API_URL`  | `http://cerebrum-api:3006`  | Pinned base URL for the cerebrum pillar                                      |
| `POPS_REGISTRY_API_URL`  | `http://registry-api:3001`  | Pinned base URL for the registry pillar                                      |

## Packaging & deployment

- **Container.** Multi-stage `pillars/mcp/Dockerfile` (pnpm workspace). The builder installs the `@pops/mcp...` filter, builds `@pops/pillar-sdk` then `@pops/mcp`, and produces a standalone `pnpm deploy --prod` tree. The runtime image is `node:22-slim`, runs as the non-root `node` user, exposes `3002`, and ships only compiled output plus production deps.
- **Compose (opt-in via `mcp` profile).** Both `infra/docker-compose.dev.yml` (builds from source) and `infra/docker-compose.yml` (pulls `ghcr.io/knoxio/pops-mcp`) define `pops-mcp` under `profiles: [mcp]`, on the `backend` network, with the `pops_api_key` secret mounted to `POPS_API_KEY_FILE`, port `${MCP_BIND_ADDR:-0.0.0.0}:3002:3002`, `depends_on: registry-api (healthy)`, and a `/health` Docker healthcheck. The prod entry carries `com.centurylinklabs.watchtower.enable: 'true'` for auto-rollout.
- **Local dev.** `mise dev` (in `pillars/mcp`) runs `tsx watch src/index.ts`; the gateway needs a service-account key and the target pillars reachable.

## CI publish

- `publish-images.yml` builds and pushes `pops-mcp` (`pillars/mcp/Dockerfile`) on push to `main`, tagged `main`, `sha-<short>`, and semver on `v*` tags.
- `docker-build.yml` validates the `pops-mcp` Dockerfile builder stage on every PR.
- The Watchtower label on the prod compose entry rolls out each new image automatically.

## Prerequisites

1. **Target pillars reachable** — the gateway is a REST client, not a standalone data source. The pillars it dispatches to (inventory, finance, contacts, media, cerebrum) and the registry must be running.
2. **A service-account key** — provisioned for the gateway and supplied via `POPS_INTERNAL_API_KEY` / `POPS_API_KEY` / `POPS_API_KEY_FILE` (the compose secret `pops_api_key`).

## Acceptance Criteria

### Transport & lifecycle

- [x] Server starts on `MCP_PORT` (default `3002`), bound `0.0.0.0`, and responds to requests.
- [x] `POST /mcp` accepts MCP JSON-RPC and returns MCP JSON-RPC responses.
- [x] Stateless transport (`sessionIdGenerator: undefined`) — a fresh `Server` + transport per request, torn down on response close; no session state retained.
- [x] Server cleanup on response close routes `server.close()` rejections through `.catch` (sync listener never trips `unhandledRejection`); the path is unit-tested.
- [x] `ListTools` returns all 30 registered tools with `name`, `description`, and `inputSchema`.
- [x] `CallTool` dispatches to the correct handler; unknown tool names return `isError: true`.
- [x] Handler exceptions are caught and returned as `isError: true` (no unhandled transport crash).
- [x] Every pillar SDK failure kind maps to `isError: true` with a readable reason via `mapCallResult`.

### Discovery, auth & config

- [x] The server SDK is configured once at module load with the service-account key, the per-pillar `internalBaseUrls` map, and an optional registry URL.
- [x] The service-account key is resolved from `POPS_INTERNAL_API_KEY`, falling back to legacy `POPS_API_KEY`; `POPS_API_KEY_FILE` is read into the key var at startup (Docker-secret pattern).
- [x] Each pinned pillar URL is overridable via its `POPS_<PILLAR>_API_URL` env var.
- [x] `getPillar<TRouter>(id)` returns a memoised, fully-typed per-pillar handle shared across tool calls.

### Health & readiness

- [x] `GET /health` returns `{ status: 'ok', tools: N }` and drives the Docker healthcheck.
- [x] `GET /ready` returns `200`/ready when a service-account key is present, `503`/degraded otherwise.

### Tool families

- [x] Inventory location tools (`tree`, `list`, `create`, `update`, `delete`) wired, with the `delete` `requiresConfirmation` passthrough.
- [x] Inventory item tools (`list`, `get`, `create`, `update`, `delete`) wired, with three-state nullable patch semantics on `update`.
- [x] Inventory item↔item connection tools (`list`, `graph`, `connect`, `disconnect`) wired; IDs accepted in any order.
- [x] Inventory fixture tools (`list`, `get`, `listForItem`, `create`, `update`, `delete`, `connect`, `disconnect`) wired; `delete` cascades connection removal.
- [x] Finance tools: `transactions.list` and `budgets.list` hit the `finance` pillar; `entities.list` hits the `contacts` pillar with entity-type validation.
- [x] Media tools: `library.list` defaults `type` to `all`; `watchlist.list` filters by `mediaType`.
- [x] Cerebrum tools: `engrams.list` forwards scope/tag/status/search filters; `engrams.get` requires `id`; `search` requires a non-empty `query` and defaults `mode` to `hybrid`.

### Coverage

- [x] Per-family vitest suites (`inventory-locations`, `inventory-items`, `inventory-connections`, `inventory-fixtures`, `finance`, `media`, `cerebrum`, plus `index`, `utils`) cover success, required-arg `isError` short-circuit (asserted before any pillar call), the `requiresConfirmation` passthrough, and failure-path mapping via a mocked `getPillar` handle.
- [x] `index.test.ts` asserts `allTools` has exactly 30 uniquely-named tools, each with a description, `inputSchema.type === 'object'`, and a handler.
- [x] `health.test.ts` boots the Express app and exercises `/health` and `/ready` (ready vs degraded).
- [x] `cleanup.test.ts` exercises the response-close cleanup and its rejection path.

### Packaging & CI

- [x] Multi-stage Dockerfile: builder resolves/builds `@pops/pillar-sdk` then `@pops/mcp`; runtime image carries only compiled output + production deps and runs as the non-root `node` user.
- [x] Dev and prod compose define `pops-mcp` under `profiles: [mcp]` on the `backend` network, with the `pops_api_key` secret, port `${MCP_BIND_ADDR:-0.0.0.0}:3002:3002`, `depends_on: registry-api (healthy)`, and a `/health` healthcheck; the prod entry pulls from GHCR with the Watchtower label.
- [x] `publish-images.yml` builds + pushes `pops-mcp` with `main`, `sha-<short>`, and semver tags; `docker-build.yml` validates the Dockerfile on every PR.

## Non-goals

- **Inbound MCP client authentication.** Callers on the LAN are trusted; front a reverse proxy if client auth is required.
- **Cross-pillar orchestration or workflows.** Each tool is a single pillar call. Federated search and the AI-tool registry live in the orchestrator pillar, not here.
- **Persisting state in the gateway.** It owns no database and self-registers nothing.
- **Exposing pillars not wired into `allTools`** (e.g. lists, registry, orchestrator).
- **Cloudflare Tunnel exposure** — intentionally omitted from the frontend network.
