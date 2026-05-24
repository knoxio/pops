# US-01: Fixture CRUD tools

> PRD: [PRD-105 — Fixture MCP Tools](README.md)
> Status: Done

## Goal

Implement five fixture management tools (list, get, create, update, delete) and expose them via the MCP interface with full test coverage.

## Acceptance Criteria

- [x] Eight fixture management tools available via the MCP interface
- [x] `inventory.fixtures.list` — accepts optional location filter, type filter, and pagination; returns matching fixtures
- [x] `inventory.fixtures.get` — accepts a required fixture identifier; returns the fixture or a not-found error
- [x] `inventory.fixtures.create` — accepts name, type, optional location and notes; returns the created fixture
- [x] `inventory.fixtures.update` — accepts a required identifier and optional fields; absent fields are no-ops; explicit null clears nullable fields
- [x] `inventory.fixtures.delete` — accepts a required identifier; removes the fixture and cascades to connections
- [x] All five CRUD tools verified functional, including success and error cases
