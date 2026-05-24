# US-01: HTTP MCP server entry point

> PRD: [PRD-102 — MCP Server](README.md)
> Status: Done

## Goal

Expose a `POST /mcp` endpoint using the MCP Streamable HTTP transport. The server starts with `node dist/index.js` (or `pnpm dev` for development) and handles MCP JSON-RPC requests from any HTTP client.

## Acceptance Criteria

- [x] `apps/pops-mcp/src/index.ts` starts an Express server on `MCP_PORT` (default 3002)
- [x] `POST /mcp` accepts MCP JSON-RPC requests and returns MCP JSON-RPC responses
- [x] Stateless transport (`sessionIdGenerator: undefined`) — no session state retained between requests
- [x] `GET /health` returns `{ status: 'ok', tools: N }` for health checks
- [x] Reads `POPS_API_KEY_FILE` (Docker secret pattern) and populates `POPS_API_KEY` at startup
- [x] Binds to `0.0.0.0` so local network clients can connect
- [x] `ListTools` returns all 14 registered tools with name, description, and inputSchema
- [x] `CallTool` dispatches to the correct handler; unknown tool names return `isError: true`
- [x] Tool handler exceptions are caught and returned as `isError: true` responses (not unhandled crashes)
