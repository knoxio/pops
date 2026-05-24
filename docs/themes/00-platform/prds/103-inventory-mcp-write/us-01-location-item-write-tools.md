# US-01: Location & item write tools

> PRD: [PRD-103 — Inventory MCP Write Tools](README.md)
> Status: Done

## Goal

Implement MCP create/update/delete tools for locations and items.

## Acceptance Criteria

- [x] Location tools expose tree, list, create, update, and delete behaviors; delete returns a confirmation shape when non-empty
- [x] Item tools expose list, get, create, update, and delete behaviors
- [x] Update operations support nullable field semantics (null clears, absent is no-op)
- [x] Unit tests cover all location and item tool behaviors including the confirmation flow
- [x] Lint, format, and typecheck pass
