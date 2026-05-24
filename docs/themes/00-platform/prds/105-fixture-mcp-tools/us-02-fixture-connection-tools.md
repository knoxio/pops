# US-02: Item-fixture connection tools

> PRD: [PRD-105 — Fixture MCP Tools](README.md)
> Status: Done

## Goal

Add connect, disconnect, and listForItem tools for item-fixture connections; wire all 8 fixture tools into the MCP interface; complete test coverage for all fixture tools.

## Acceptance Criteria

- [x] `inventory.fixtures.connect` — accepts an item identifier and fixture identifier; links the item to the fixture
- [x] `inventory.fixtures.disconnect` — accepts an item identifier and fixture identifier; removes the link between them
- [x] `inventory.fixtures.listForItem` — accepts an item identifier and optional pagination; returns all fixtures linked to that item
- [x] All 8 fixture tools accessible via the MCP interface
- [x] All fixture tools verified functional, including CONFLICT and NOT_FOUND error propagation
