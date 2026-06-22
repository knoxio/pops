# pops-mcp

MCP (Model Context Protocol) HTTP server for POPS. Exposes finance, media, inventory, and Cerebrum data as tools that AI agents (Claude Desktop, Claude Code, any MCP client) can call over the local network.

- **Transport:** Streamable HTTP (`POST /mcp`), stateless
- **Port:** 3002 (configurable via `MCP_PORT`)
- **Auth:** Calls pops-api via service-account `X-API-Key` — no auth on inbound MCP connections

See [PRD-102](../../docs/themes/00-platform/prds/102-mcp-server/README.md) for full specification.

## Prerequisites

1. **pops-api is running** — pops-mcp calls it via tRPC. No direct database access.
2. **A service-account API key** — provision via the pops-api admin UI → Service Accounts. The key is shared with moltbot; `secrets/pops_api_key` already exists if moltbot is deployed.

## Running locally (dev)

```bash
# Start pops-api first
mise dev:api

# Then start pops-mcp in a separate terminal
mise dev:mcp
```

Set `POPS_API_URL` and `POPS_API_KEY` in `apps/pops-mcp/.env` (or the root `.env`):

```env
POPS_API_URL=http://localhost:3000
POPS_API_KEY=sa_your_service_account_key_here
MCP_PORT=3002
```

## Running via Docker Compose

pops-mcp is opt-in via the `mcp` compose profile:

```bash
# Dev compose (builds from source)
docker compose -f infra/docker-compose.dev.yml --profile mcp up -d pops-mcp

# Production compose (pulls from GHCR)
docker compose -f infra/docker-compose.yml --profile mcp up -d pops-mcp
```

The `secrets/pops_api_key` file must exist on the host (same file used by moltbot).

## Connecting Claude Code

Add to `.claude/settings.json` (or `~/.claude/settings.json` for global config):

```json
{
  "mcpServers": {
    "pops": {
      "command": "curl",
      "args": ["-s", "-X", "POST", "http://pops.local:3002/mcp"],
      "type": "http",
      "url": "http://pops.local:3002/mcp"
    }
  }
}
```

Or use the HTTP transport directly if your Claude Code version supports it:

```json
{
  "mcpServers": {
    "pops": {
      "type": "http",
      "url": "http://pops.local:3002/mcp"
    }
  }
}
```

## Connecting Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pops": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://pops.local:3002/mcp"]
    }
  }
}
```

Replace `pops.local` with your server's hostname or IP address.

## Available tools (14)

| Tool                          | Description                                       |
| ----------------------------- | ------------------------------------------------- |
| `inventory.locations.tree`    | Full location hierarchy (nested)                  |
| `inventory.locations.list`    | Flat list of all locations                        |
| `inventory.items.list`        | Items with search/location/type/condition filters |
| `inventory.items.get`         | Single item by ID                                 |
| `inventory.connections.list`  | Connections for an item                           |
| `inventory.connections.graph` | Connection graph (nodes + edges)                  |
| `finance.transactions.list`   | Transactions with date/entity/type filters        |
| `finance.entities.list`       | Entities (merchants)                              |
| `finance.budgets.list`        | Budgets with period/active filters                |
| `media.library.list`          | Library (movies + TV) with search/genre           |
| `media.watchlist.list`        | Watchlist                                         |
| `cerebrum.engrams.list`       | Engrams with scope/tag/search filters             |
| `cerebrum.engrams.get`        | Single engram by ID                               |
| `cerebrum.search`             | Hybrid semantic + structured search               |

## Health check

```bash
curl http://localhost:3002/health
# {"status":"ok","tools":14}
```
