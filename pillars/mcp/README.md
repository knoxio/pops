# @pops/mcp

MCP (Model Context Protocol) HTTP gateway for POPS. Exposes inventory, finance, media, and Cerebrum data — read and write — as tools that AI agents (Claude Desktop, Claude Code, any MCP client) call over the local network. Each tool dispatches to the owning pillar over REST through `@pops/pillar-sdk`; the gateway owns no database and no business logic.

- **Transport:** Streamable HTTP (`POST /mcp`), stateless — a fresh server + transport per request
- **Port:** 3002 (configurable via `MCP_PORT`), bound `0.0.0.0` for LAN reach
- **Auth:** Outbound only. Authenticates to pillars with a service-account key (`POPS_INTERNAL_API_KEY`, legacy `POPS_API_KEY`, or the `POPS_API_KEY_FILE` Docker-secret pattern). Inbound MCP connections are unauthenticated — LAN-trusted.

See the [MCP Server PRD](../../docs/themes/platform/prds/mcp-server/README.md) for the gateway spec and the [Tool Inventory](docs/prds/tool-inventory/README.md) for the per-tool surface.

## Prerequisites

1. **Target pillars reachable** — the gateway is a REST client, not a standalone data source. Inventory, finance, contacts, media, cerebrum, and the registry must be running.
2. **A service-account key** — supplied via `POPS_INTERNAL_API_KEY` / `POPS_API_KEY` / `POPS_API_KEY_FILE` (the compose secret `pops_api_key`).

## Running locally (dev)

```bash
mise dev
```

Per-pillar base URLs default to the Docker-network hostnames; override any with its `POPS_<PILLAR>_API_URL` env var. Set the service-account key in `pillars/mcp/.env` (or the root `.env`):

```env
POPS_INTERNAL_API_KEY=sa_your_service_account_key_here
MCP_PORT=3002
```

## Running via Docker Compose

`pops-mcp` is opt-in via the `mcp` compose profile:

```bash
# Dev compose (builds from source)
docker compose -f infra/docker-compose.dev.yml --profile mcp up -d pops-mcp

# Production compose (pulls from GHCR)
docker compose -f infra/docker-compose.yml --profile mcp up -d pops-mcp
```

The `secrets/pops_api_key` file must exist on the host.

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

## Health & readiness

```bash
curl http://localhost:3002/health
# {"status":"ok","tools":30}

curl http://localhost:3002/ready
# {"status":"ready","apiKeyConfigured":true,"tools":30}  (503/degraded if no key)
```
