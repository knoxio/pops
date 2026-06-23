# MCP Tool Inventory

> Domain: [MCP Gateway](../../README.md) · Gateway plumbing: [MCP Server PRD](../../../../../docs/themes/00-platform/prds/mcp-server/README.md)

Status: Done — 30 tools wired into `allTools`, every family vitest-covered.

## Purpose

Catalogue the tools the MCP gateway advertises and the pillar each one drives. This PRD is the per-tool surface; the transport, request lifecycle, container packaging, and CI publish are owned by the central [MCP Server PRD](../../../../../docs/themes/00-platform/prds/mcp-server/README.md) and are not repeated here.

Each tool is an adapter in `pillars/mcp/src/tools/*`. A handler reads MCP args, calls the owning pillar through `getPillar<TRouter>(id).<domain>.<op>(...)`, and returns `mapCallResult(...)`: SDK `kind: 'ok'` → the value as pretty JSON text; every failure shape → `{ isError: true }` with a human-readable reason the model can act on. Tools register flat into `allTools` (`tools/index.ts`); the server lists them via `ListTools` and routes a `CallTool` by name.

## Tool surface (30 tools)

Tool names are the MCP-facing identifiers. The endpoint column is the REST route on the owning pillar reached by the SDK.

### Inventory — locations (`inventory` pillar)

| Tool                         | REST endpoint                  | Required | Optional / notes                                         |
| ---------------------------- | ------------------------------ | -------- | -------------------------------------------------------- |
| `inventory.locations.tree`   | `GET /locations/tree`          | —        | Nested hierarchy (all roots + children)                  |
| `inventory.locations.list`   | `GET /locations`               | —        | Flat array                                               |
| `inventory.locations.create` | `POST /locations`              | `name`   | `parentId` (null/omit → root), `sortOrder`               |
| `inventory.locations.update` | `PATCH /locations/:id`         | `id`     | `name`, `parentId` (null → promote to root), `sortOrder` |
| `inventory.locations.delete` | `DELETE /locations/:id?force=` | `id`     | `force` (bool, default false)                            |

### Inventory — items (`inventory` pillar)

| Tool                     | REST endpoint       | Required   | Optional / notes                                                                  |
| ------------------------ | ------------------- | ---------- | --------------------------------------------------------------------------------- |
| `inventory.items.list`   | `GET /items`        | —          | `search`, `locationId`, `includeChildren`, `type`, `condition`, `limit`, `offset` |
| `inventory.items.get`    | `GET /items/:id`    | `id`       | Full metadata                                                                     |
| `inventory.items.create` | `POST /items`       | `itemName` | full item field set; returns generated `id`                                       |
| `inventory.items.update` | `PATCH /items/:id`  | `id`       | any item field; nullable fields accept `null` to clear                            |
| `inventory.items.delete` | `DELETE /items/:id` | `id`       | —                                                                                 |

Item fields (create/update): `brand`, `model`, `itemId`, `room`, `type`, `condition`, `assetId`, `notes`, `locationId`, `purchasedFromName` (nullable strings); `purchaseDate`, `warrantyExpires` (ISO date strings); `replacementValue`, `resaleValue`, `purchasePrice` (nullable numbers); `inUse`, `deductible` (bools).

### Inventory — item-to-item connections (`inventory` pillar)

| Tool                               | REST endpoint                           | Required             | Optional / notes                              |
| ---------------------------------- | --------------------------------------- | -------------------- | --------------------------------------------- |
| `inventory.connections.list`       | `GET /connections?itemId=`              | `itemId`             | `limit`, `offset` — links in either direction |
| `inventory.connections.graph`      | `GET /connections/graph?itemId=`        | `itemId`             | `maxDepth` (default 3) — nodes + edges        |
| `inventory.connections.connect`    | `POST /connections`                     | `itemAId`, `itemBId` | IDs in any order                              |
| `inventory.connections.disconnect` | `DELETE /connections?itemAId=&itemBId=` | `itemAId`, `itemBId` | IDs in any order                              |

### Inventory — fixtures (`inventory` pillar)

Fixtures are non-owned infrastructure objects (outlets, patch panels, cable runs) that items connect to.

| Tool                             | REST endpoint                  | Required              | Optional / notes                                   |
| -------------------------------- | ------------------------------ | --------------------- | -------------------------------------------------- |
| `inventory.fixtures.list`        | `GET /fixtures`                | —                     | `locationId`, `type`, `limit`, `offset`            |
| `inventory.fixtures.get`         | `GET /fixtures/:id`            | `id`                  | —                                                  |
| `inventory.fixtures.listForItem` | `GET /fixtures?itemId=`        | `itemId`              | `limit`, `offset`                                  |
| `inventory.fixtures.create`      | `POST /fixtures`               | `name`, `type`        | `locationId`, `notes`                              |
| `inventory.fixtures.update`      | `PATCH /fixtures/:id`          | `id`                  | `name`, `type`; `locationId`/`notes` null to clear |
| `inventory.fixtures.delete`      | `DELETE /fixtures/:id`         | `id`                  | removes all item connections to the fixture        |
| `inventory.fixtures.connect`     | `POST /fixtures/connections`   | `itemId`, `fixtureId` | item↔fixture link                                  |
| `inventory.fixtures.disconnect`  | `DELETE /fixtures/connections` | `itemId`, `fixtureId` | —                                                  |

### Finance (`finance` + `contacts` pillars)

| Tool                        | Pillar     | REST endpoint       | Required | Optional / notes                                                                                             |
| --------------------------- | ---------- | ------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `finance.transactions.list` | `finance`  | `GET /transactions` | —        | `search`, `startDate`, `endDate`, `entityId`, `account`, `type` (income/expense/transfer), `limit`, `offset` |
| `finance.entities.list`     | `contacts` | `GET /entities`     | —        | `search`, `type` (company/person/government/bank/place/brand/organisation), `limit`, `offset`                |
| `finance.budgets.list`      | `finance`  | `GET /budgets`      | —        | `search`, `period` (monthly/yearly), `active` ("true"/"false"), `limit`, `offset`                            |

`finance.entities.list` reads the `contacts` pillar — the authoritative entity store — not `finance`.

### Media (`media` pillar)

| Tool                   | REST endpoint    | Required | Optional / notes                                                                   |
| ---------------------- | ---------------- | -------- | ---------------------------------------------------------------------------------- |
| `media.library.list`   | `GET /library`   | —        | `type` (all/movie/tv, default all), `search`, `genre`, `page`, `pageSize` (max 96) |
| `media.watchlist.list` | `GET /watchlist` | —        | `mediaType` (movie/tv_show), `limit`, `offset`                                     |

### Cerebrum (`cerebrum` pillar)

| Tool                    | REST endpoint            | Required | Optional / notes                                                                                |
| ----------------------- | ------------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| `cerebrum.engrams.list` | `GET /engrams`           | —        | `search`, `type`, `scopes[]`, `tags[]`, `status` (active/archived), `limit` (max 500), `offset` |
| `cerebrum.engrams.get`  | `GET /engrams/:id`       | `id`     | full metadata + body                                                                            |
| `cerebrum.search`       | `POST /retrieval/search` | `query`  | `mode` (semantic/structured/hybrid, default hybrid), `limit` (default 10)                       |

## Rules

- **Adapter-only.** No tool owns data, validation, or business logic — that lives in the pillar. The gateway never reaches a database directly.
- **Result normalisation.** `mapCallResult` turns the SDK `CallResult` into MCP: `ok` → JSON text; `not-found` / `conflict` / `bad-request` / `unauthorized` → `isError` with the pillar message; `unavailable` / `degraded` / `contract-mismatch` → `isError` with a retry-oriented message naming the pillar. The handler never throws to the transport.
- **Required-arg short-circuit.** Required string IDs (`id`, `itemName`, `name`, `itemAId`, `itemBId`, `itemId`, `fixtureId`, `query`) are validated with `reqStr`/inline checks and return `isError` _before_ any pillar call when missing or empty.
- **Three-state patch semantics (update tools).** Only keys explicitly present in the args are forwarded. Nullable string/number fields forward an explicit `null` to clear a column; non-null fields (`itemName`, `inUse`, `deductible`) drop `null` so a NOT-NULL column can't be nulled. Numbers are validated `typeof === 'number'`, so `0` is a legal value, not "absent".
- **Connection ordering.** `connect`/`disconnect` accept item IDs in any order; the inventory pillar enforces canonical ordering server-side.
- **Enum coercion.** Constrained args (`type`, `mode`, `period`, `active`, `mediaType`, entity `type`) are validated against their allowed set and fall back to the default (or are dropped) when invalid, rather than forwarding garbage to the pillar.

## Edge cases

| Case                                                             | Behaviour                                                                                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `inventory.locations.delete` on a non-empty location w/o `force` | `{ requiresConfirmation: true, stats }` passed through as **success** — the model confirms and re-calls with `force: true` |
| `force: true` delete                                             | cascade-deletes child locations; items in them become unlocated (`locationId` = null), not deleted                         |
| `inventory.connections.connect` on an already-linked pair        | pillar conflict → `isError: true` with reason                                                                              |
| `inventory.connections.disconnect` on a missing link             | pillar not-found → `isError: true`                                                                                         |
| `inventory.fixtures.delete`                                      | item↔fixture connections removed automatically                                                                             |
| update tool with no mutable fields present                       | empty patch forwarded; pillar applies no change and returns current row (not an error)                                     |
| any required ID/name missing or empty                            | `isError: true` returned before the pillar is called                                                                       |
| pillar unavailable / degraded / contract mismatch                | `isError: true` with a retry-oriented, pillar-named message                                                                |

## Acceptance criteria

Catalogue

- [x] `allTools` aggregates inventory (locations + items + connections), inventory fixtures, finance, media, and cerebrum tool families into one flat array the server lists via `ListTools` and routes by name.
- [x] Every handler returns through `mapCallResult`, so no pillar failure escapes as a thrown error to the transport (`utils.ts` maps all six `CallResult` failure kinds to `isError`).

Inventory — locations

- [x] `inventory.locations.tree` / `.list` take no args and return the nested tree / flat list.
- [x] `inventory.locations.create` requires `name`, accepts `parentId` (null/omit → root) and `sortOrder`, returns the created location incl. `id`; `isError` on empty `name`.
- [x] `inventory.locations.update` forwards only provided fields; `parentId: null` promotes to root; `isError` on empty `id`.
- [x] `inventory.locations.delete` passes `{ requiresConfirmation, stats }` through as success for a non-empty location without `force`; `isError` on empty `id`.

Inventory — items

- [x] `inventory.items.list` forwards `search`/`locationId`/`includeChildren`/`type`/`condition`/`limit`/`offset` filters; `inventory.items.get` requires `id`.
- [x] `inventory.items.create` requires only `itemName`, accepts the full field set, returns the item incl. generated `id`; `isError` on empty `itemName`.
- [x] `inventory.items.update` forwards only explicitly-present fields (null clears nullable columns; `0` preserved); `isError` on empty `id`.
- [x] `inventory.items.delete` requires `id`.

Inventory — connections

- [x] `inventory.connections.list` / `.graph` require `itemId` (graph honours `maxDepth`).
- [x] `inventory.connections.connect` / `.disconnect` require both IDs in any order; conflict / not-found surface as `isError`.

Inventory — fixtures

- [x] `inventory.fixtures.list` filters by `locationId`/`type`; `.get` requires `id`; `.listForItem` requires `itemId`.
- [x] `inventory.fixtures.create` requires `name` + `type`; `.update` requires `id` with null-to-clear on `locationId`/`notes`; `.delete` requires `id` and cascades connection removal.
- [x] `inventory.fixtures.connect` / `.disconnect` require `itemId` + `fixtureId`.

Finance / Media / Cerebrum

- [x] `finance.transactions.list` and `finance.budgets.list` hit the `finance` pillar; `finance.entities.list` hits the `contacts` pillar with entity-type validation.
- [x] `media.library.list` defaults `type` to `all` and coerces `page`/`pageSize`; `media.watchlist.list` filters by `mediaType`.
- [x] `cerebrum.engrams.list` forwards scope/tag/status/search filters; `cerebrum.engrams.get` requires `id`; `cerebrum.search` requires a non-empty `query` and defaults `mode` to `hybrid`.

Coverage

- [x] Per-family vitest suites (`inventory-locations`, `inventory-items`, `inventory-connections`, `inventory-fixtures`, `finance`, `media`, `cerebrum`, `index`, `utils`) cover success, required-arg `isError` short-circuit (asserted before any pillar call), the `requiresConfirmation` passthrough, and failure-path mapping via a mocked `getPillar` handle.
