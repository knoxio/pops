# US-07: Tool handler tests

> PRD: [PRD-102 — MCP Server](README.md)
> Status: In progress

## Goal

Test all 14 MCP tool handlers to ensure they correctly translate inputs into tRPC calls and format outputs as MCP text content.

## Acceptance Criteria

- [ ] Unit tests for each tool domain (inventory, finance, media, cerebrum) — mocking the tRPC client
- [ ] Test that optional inputs produce `undefined` (not `null`) in the tRPC call
- [ ] Test that enum inputs are validated — invalid values are excluded (passed as `undefined`)
- [ ] Test that array inputs (scopes, tags) filter non-string elements
- [ ] Test that `isError: true` is returned when the tRPC client throws
- [ ] Test the `ListTools` handler returns all 14 tools with correct names
- [ ] Test the `CallTool` dispatcher returns `isError: true` for unknown tool names
- [ ] Integration test: `POST /mcp` with a `ListTools` request returns a valid MCP response
