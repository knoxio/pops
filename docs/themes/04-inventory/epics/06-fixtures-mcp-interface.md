# Epic 06: Fixtures & MCP Interface

> Theme: [Inventory](../README.md)

## Scope

Expose the full inventory domain to Claude via MCP write tools, and introduce fixtures as a first-class entity for house infrastructure (power outlets, ethernet ports, light switches, etc.) that items connect to but that are not owned.

Done means: a user can walk through their house, dictate locations, items, item-to-item connections, and item-to-fixture connections entirely through conversation with Claude — no UI required.

## PRDs

| #   | PRD                                                                    | Summary                                                           | Status |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- | ------ |
| 103 | [Inventory MCP Write Tools](../prds/103-inventory-mcp-write/README.md) | MCP mutations for locations, items, and item-item connections     | Done   |
| 104 | [Fixtures Data Model](../prds/104-fixtures-data-model/README.md)       | `fixtures` table, `item_fixture_connections` table, tRPC router   | Done   |
| 105 | [Fixture MCP Tools](../prds/105-fixture-mcp/README.md)                 | MCP tools for fixture CRUD and item-fixture connection management | Done   |

PRD-103 is independent and can start immediately. PRD-104 is independent of 103 but blocks PRD-105. PRDs 103 and 104 can be built in parallel.

## Dependencies

- **Requires:** Epic 00 (schema), Epic 01 (tRPC routers for items/locations/connections — all mutations already exist)
- **Unlocks:** Full hands-free home inventory via Claude; fixture-aware connection graph

## Out of Scope

- Fixture-to-fixture connections (e.g. wall outlet → breaker panel)
- Connection types (power, data, audio) — item metadata carries this
- UI for fixtures (app surfaces are future work)
- Bulk import / CSV upload
