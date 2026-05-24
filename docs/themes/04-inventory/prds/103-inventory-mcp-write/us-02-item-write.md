# US-02: Item Write Tools

> PRD: [Inventory MCP Write Tools](README.md)

## Description

As a user dictating my inventory, I want to tell Claude about items I own — what they are, where they live, their brand, condition, and value — and have Claude create or update records without me touching the UI.

## Acceptance Criteria

- [ ] `inventory.items.create` tool exists in `inventoryTools` and calls `inventory.items.create.mutate(input)`
- [ ] `inventory.items.create` returns `isError: true` when `itemName` is missing or empty
- [ ] `inventory.items.create` succeeds with only `itemName` provided (all other fields optional)
- [ ] `inventory.items.create` accepts the full field set: `brand`, `model`, `itemId`, `room`, `location`, `type`, `condition`, `inUse`, `deductible`, `purchaseDate`, `warrantyExpires`, `replacementValue`, `resaleValue`, `purchasePrice`, `purchasedFromName`, `assetId`, `notes`, `locationId`
- [ ] `inventory.items.create` returns the full created item (including generated `id`) on success
- [ ] `inventory.items.update` tool exists and calls `inventory.items.update.mutate({ id, data })`
- [ ] `inventory.items.update` returns `isError: true` when `id` is missing or empty
- [ ] `inventory.items.update` passes only the data fields that were explicitly provided
- [ ] `inventory.items.update` returns the updated item on success
- [ ] `inventory.items.delete` tool exists and calls `inventory.items.delete.mutate({ id })`
- [ ] `inventory.items.delete` returns `isError: true` when `id` is missing or empty
- [ ] `inventory.items.delete` returns a success message on deletion
- [ ] All three tools have vitest tests covering the above cases
- [ ] `mockClient.inventory.items` in `test-helpers.ts` includes `create.mutate`, `update.mutate`, and `delete.mutate` mocks

## Notes

For `items.update`, only fields explicitly present in the tool args object should be forwarded to tRPC. Do not forward `undefined` values for fields the caller did not supply — the tRPC schema treats supplied `undefined` differently from absent keys in some Zod versions.

Number fields (`replacementValue`, `resaleValue`, `purchasePrice`) must be validated as `typeof x === 'number'` before forwarding, not just truthy, since `0` is a valid value.
