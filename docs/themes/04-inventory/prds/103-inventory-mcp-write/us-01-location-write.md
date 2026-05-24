# US-01: Location Write Tools

> PRD: [Inventory MCP Write Tools](README.md)

## Description

As a user walking through my house, I want to tell Claude to create, rename, move, or delete locations so the location tree reflects the actual physical layout of my home.

## Acceptance Criteria

- [ ] `inventory.locations.create` tool exists in `inventoryTools` and calls `inventory.locations.create.mutate({ name, parentId, sortOrder })`
- [ ] `inventory.locations.create` returns `isError: true` when `name` is missing or empty
- [ ] `inventory.locations.create` returns the created location object (including `id`) on success
- [ ] `inventory.locations.update` tool exists and calls `inventory.locations.update.mutate({ id, data })`
- [ ] `inventory.locations.update` returns `isError: true` when `id` is missing or empty
- [ ] `inventory.locations.update` passes only the fields that were provided (no accidental nulls for omitted fields)
- [ ] `inventory.locations.delete` tool exists and calls `inventory.locations.delete.mutate({ id, force })`
- [ ] `inventory.locations.delete` without `force: true` returns `{ requiresConfirmation: true, stats }` for non-empty locations — not `isError`
- [ ] `inventory.locations.delete` with `force: true` returns success message
- [ ] `inventory.locations.delete` returns `isError: true` for a missing or empty `id`
- [ ] All three tools have vitest tests covering the above cases
- [ ] `mockClient.inventory.locations` in `test-helpers.ts` includes `create.mutate`, `update.mutate`, and `delete.mutate` mocks

## Notes

The tRPC `delete` mutation returns `{ requiresConfirmation: true, stats }` (not a thrown error) when `force` is false and the location is non-empty. The MCP tool must pass this through via `ok()` rather than treat it as an error — Claude reads the response and decides whether to ask the user for confirmation.

`parentId` on create/update accepts `null` to explicitly make a location a root node.
