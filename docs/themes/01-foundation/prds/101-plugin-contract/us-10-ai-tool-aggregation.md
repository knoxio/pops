# US-10: AI tool surface aggregation

> PRD: [Plugin Contract](README.md)
> Status: Not started

## Description

As Ego (or any MCP-speaking client), I want a single source listing every AI-callable tool the installed modules expose so that the available tool set is exactly the installed module set, with no manual registration.

## Acceptance Criteria

- [ ] Each module declares its AI-callable tools via `backend.aiTools: AiToolDescriptor[]` in its manifest. `AiToolDescriptor` mirrors the MCP tool shape: `{ name, description, inputSchema (Zod), handler }`.
- [ ] MCP server (`apps/pops-api/src/mcp/server.ts` or equivalent) exposes the merged tool set from `MODULES.flatMap(m => m.backend?.aiTools ?? [])`.
- [ ] Ego conversation engine (`apps/pops-api/src/modules/cerebrum/ego/`) uses the same merged list when assembling tool context for LLM calls.
- [ ] Per-module ad-hoc tool registration (e.g. cerebrum's existing tool wiring under `cerebrum/mcp/`) is migrated into the manifest; the registration call site is deleted.
- [ ] Tool name uniqueness is checked at registry build time; collisions fail the build with both module ids named.
- [ ] Test: with `POPS_APPS=finance`, the MCP server's `tools/list` response contains only finance tools and the core tools; no media or inventory tools appear.

## Notes

- This US is what makes the AI overlay "collect tools across all apps" from the architectural note real — and removes the need for any module to know about Ego or MCP infrastructure.
- Tool handlers are typed against the module's tRPC context; reuse the procedure types where possible.
