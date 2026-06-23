# Inventory MCP Write Tools

Status: Done — all 8 write tools shipped in the `mcp` pillar with vitest coverage.

## Purpose

Expose the inventory pillar's write surface (locations, items, item-to-item connections) as MCP tools so an LLM can mutate the home inventory hands-free: create/rename/move/delete locations, dictate items, and record physical cable/peripheral links — without touching the UI.

These are adapter tools only. The data model and mutation logic live entirely in the inventory pillar (its own SQLite DB: `home_inventory` items, `locations`, `item_connections`). The MCP tools call the inventory pillar's ts-rest contract through the `@pops/pillar-sdk` `getPillar('inventory')` client; there is no separate write path.

## Where it lives

- Tools are defined in the `mcp` pillar: `pillars/mcp/src/tools/inventory-locations.ts`, `inventory-items-write.ts`, `inventory-connections.ts`.
- They are aggregated `locationTools + itemTools + connectionTools` → `inventoryTools` (`inventory.ts`) → `allTools` (`tools/index.ts`), which the MCP server (`pillars/mcp/src/index.ts`) lists and dispatches over Streamable HTTP at `POST /mcp`.
- Each handler calls the inventory pillar via `getPillar('inventory').inventory.<domain>.<op>(...)` and normalises the SDK `CallResult` with `mapCallResult()`: `kind: 'ok'` → JSON text, every failure shape → `{ isError: true }` with a human-readable reason the model can self-correct on.

## Tool surface (8 write tools)

Each tool name is the MCP-facing identifier; the underlying REST endpoint is on the inventory pillar.

### Locations

| Tool                         | Inventory REST endpoint        | Required | Optional                        |
| ---------------------------- | ------------------------------ | -------- | ------------------------------- |
| `inventory.locations.create` | `POST /locations`              | `name`   | `parentId`, `sortOrder`         |
| `inventory.locations.update` | `PATCH /locations/:id`         | `id`     | `name`, `parentId`, `sortOrder` |
| `inventory.locations.delete` | `DELETE /locations/:id?force=` | `id`     | `force` (bool, default false)   |

### Items

| Tool                     | Inventory REST endpoint | Required   | Optional                          |
| ------------------------ | ----------------------- | ---------- | --------------------------------- |
| `inventory.items.create` | `POST /items`           | `itemName` | all other item fields             |
| `inventory.items.update` | `PATCH /items/:id`      | `id`       | any item field, nullable to clear |
| `inventory.items.delete` | `DELETE /items/:id`     | `id`       | —                                 |

### Item-to-item connections

| Tool                               | Inventory REST endpoint                 | Required             |
| ---------------------------------- | --------------------------------------- | -------------------- |
| `inventory.connections.connect`    | `POST /connections`                     | `itemAId`, `itemBId` |
| `inventory.connections.disconnect` | `DELETE /connections?itemAId=&itemBId=` | `itemAId`, `itemBId` |

Item fields for create/update: `brand`, `model`, `itemId`, `room`, `type`, `condition`, `inUse` (bool), `deductible` (bool), `purchaseDate`, `warrantyExpires` (ISO date strings), `replacementValue`, `resaleValue`, `purchasePrice` (numbers), `purchasedFromName`, `assetId`, `notes`, `locationId`.

## Business rules

- **Connect ordering**: `connect`/`disconnect` accept `itemAId`/`itemBId` in any order; the inventory pillar enforces `item_a_id < item_b_id` ordering server-side. The tool does not sort.
- **Delete confirmation handshake**: `inventory.locations.delete` without `force: true` returns `{ requiresConfirmation: true, stats }` (child/descendant/item counts) for a non-empty location — a successful response, NOT an error. The model surfaces it to the user and re-calls with `force: true`.
- **Force cascade**: `delete` with `force: true` cascade-deletes child locations; items in deleted locations have `locationId` set to null (they become unlocated, not deleted).
- **Patch semantics on update**: only fields explicitly present in the tool args are forwarded as `data`. Omitted keys are never sent (no accidental nulls). Nullable string/number fields forward an explicit `null` to clear a column; non-null `inUse`/`deductible`/`itemName` drop `null` so a NOT-NULL column can't be nulled. Number fields are validated `typeof === 'number'` so `0` is a valid value.
- **Three-bucket arg helpers**: `reqStr` rejects empty/missing required strings before any pillar call; `nullStr`/`nullNum` distinguish absent (no-op) from explicit `null` (clear).

## Edge cases

| Case                                                          | Behaviour                                                             |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `locations.delete` non-empty without `force`                  | `{ requiresConfirmation: true, stats }` passed through as success     |
| `connections.connect` on already-connected pair               | inventory returns conflict → tool returns `isError: true` with reason |
| `connections.disconnect` on non-existent link                 | inventory returns not-found → tool returns `isError: true`            |
| `items.update` with no data fields                            | inventory applies no changes, returns current item — not an error     |
| any required `id`/`name`/`itemAId`/`itemBId` missing or empty | tool returns `isError: true` before calling the pillar                |
| pillar unavailable / degraded / contract mismatch             | `mapCallResult` returns `isError: true` with a retry-oriented message |

## Acceptance criteria

Locations

- [x] `inventory.locations.create` calls `POST /locations` with `{ name, parentId?, sortOrder? }`, returns `isError` on empty `name`, else the created location incl. `id`.
- [x] `inventory.locations.update` calls `PATCH /locations/:id` with only provided fields; `parentId: null` promotes to root; returns `isError` on empty `id`.
- [x] `inventory.locations.delete` calls `DELETE /locations/:id?force=`; non-empty without force passes `{ requiresConfirmation, stats }` through as success; `isError` on empty `id`.

Items

- [x] `inventory.items.create` requires only `itemName`, accepts the full field set, returns the created item incl. generated `id`; `isError` on empty `itemName`.
- [x] `inventory.items.update` calls `PATCH /items/:id` forwarding only explicitly-present fields (null clears nullable columns; `0` preserved); `isError` on empty `id`.
- [x] `inventory.items.delete` calls `DELETE /items/:id`, returns a success message; `isError` on empty `id`.

Connections

- [x] `inventory.connections.connect` requires both IDs, returns the connection record `{ id, itemAId, itemBId, createdAt }`; conflict on an existing pair surfaces as `isError`.
- [x] `inventory.connections.disconnect` requires both IDs, returns success; not-found surfaces as `isError`.

Coverage

- [x] vitest suites `inventory-locations.test.ts`, `inventory-items.test.ts`, `inventory-connections.test.ts` cover success, validation `isError` (missing/empty required args, asserted to short-circuit before any pillar call), the `requiresConfirmation` passthrough, and the `unavailable` / `contract-mismatch` failure paths via a mocked `getPillar` handle.
- [x] `utils.test.ts` covers `ok` / `toolError` and the three-bucket arg helpers (`reqStr`, `optStr`/`optNum`/`optBool`, `nullStr`/`nullNum`, `copyOpt*`/`copyNull*`) including the `0`-preserved and explicit-`null`-clear branches.

> Conflict (connect on an existing pair) and not-found (disconnect on a missing link) are mapped to `isError` by the shared `mapCallResult` / `formatFailureReason` in `utils.ts`, but those two branches are not yet exercised by a dedicated test — see `docs/ideas/mcp-write-failure-path-tests.md`.
