# US-03: MCP canary — migrate `inventory-locations.ts` to `pillar()`

> PRD: [SDK consumer migration audit](README.md)

## Description

As an MCP maintainer, I want the locations tool file to call `pillar('inventory').locations.*` instead of the merged `pops-api` tRPC client so the SDK pattern is proven on the Node side before fanning out across the remaining MCP / CLI tool files.

## Acceptance Criteria

- [ ] `apps/pops-mcp/src/tools/inventory-locations.ts` stops calling `getClient()` inside every handler and instead calls `pillar('inventory', { authHeaders: () => ({ 'x-api-key': POPS_API_KEY }) }).locations.<proc>.orThrow(input)`.
- [ ] The factory configuration (registry URL, auth headers) is centralised in a new `apps/pops-mcp/src/pillar-client.ts` so the other tool files can adopt it incrementally.
- [ ] `apps/pops-mcp/src/tools/inventory-locations.test.ts` is rewritten to mock `pillar()` instead of `getClient` (a `@pops/pillar-sdk/testing/discovery` fake transport is acceptable).
- [ ] Failure shapes (`unavailable`, `contract-mismatch`) surface as MCP `toolError` results with a descriptive message — verified by tests.
- [ ] `POPS_REGISTRY_URL` env var is documented in `apps/pops-mcp/README.md` (default `http://core-api:3001`).
- [ ] `pnpm --filter @pops/mcp typecheck` + `pnpm --filter @pops/mcp test` pass.

## Notes

Blocker: this work cannot start until `core.registry.snapshot` resolves on `pops-core-api` (see PRD-227 preconditions). The `inventory.locations.*` manifest entries on `pops-inventory-api` already cover every procedure this file calls (tree, list, create, update, delete), so once the registry is healthy this tool file is a one-PR cut.
