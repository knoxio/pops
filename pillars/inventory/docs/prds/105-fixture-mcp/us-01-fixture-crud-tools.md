# US-01: Fixture CRUD MCP Tools

> PRD: [Fixture MCP Tools](README.md)

## Description

As a user walking through my house, I want to tell Claude about infrastructure fixtures — power outlets, ethernet ports, wall panels — so Claude can record them and later connect my items to them.

## Acceptance Criteria

- [ ] `inventory.fixtures.list` tool exists, calls `inventory.fixtures.list.query` with optional `search`, `locationId`, `type`, `limit`, `offset`
- [ ] `inventory.fixtures.get` tool exists, calls `inventory.fixtures.get.query({ id })`; returns `isError: true` for missing/empty `id`
- [ ] `inventory.fixtures.create` tool exists, calls `inventory.fixtures.create.mutate({ name, type, locationId, notes })`; returns `isError: true` when `name` is missing or empty
- [ ] `inventory.fixtures.create` returns the created fixture object (including `id`) on success
- [ ] `inventory.fixtures.update` tool exists, calls `inventory.fixtures.update.mutate({ id, data })`; returns `isError: true` when `id` is missing or empty
- [ ] `inventory.fixtures.update` passes only explicitly provided data fields
- [ ] `inventory.fixtures.delete` tool exists, calls `inventory.fixtures.delete.mutate({ id })`; returns `isError: true` when `id` is missing or empty
- [ ] `inventory.fixtures.delete` returns a success message (does not require confirmation)
- [ ] All five tools have vitest tests covering success paths and invalid-input error paths
- [ ] `mockClient.inventory.fixtures` in `test-helpers.ts` includes `list.query`, `get.query`, `create.mutate`, `update.mutate`, `delete.mutate` mocks

## Notes

`fixtures.delete` intentionally has no confirmation flow — the cascade behaviour (connections removed, items untouched) is the correct and expected outcome when a user moves house and wants to reset all fixtures. Do not add a `force` parameter.
