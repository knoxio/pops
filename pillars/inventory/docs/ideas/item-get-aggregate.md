# Item detail aggregate on `GET /items/:id`

> Status: Idea — not built. `GET /items/:id` currently returns the raw `home_inventory` row only.

## Problem

The item detail view has to make three round-trips to render the header: `GET /items/:id`, `GET /locations/:id/path` (breadcrumb), and counts via the connections/photos list endpoints. The original data-model PRD specified that `get` would return a location breadcrumb plus connection and photo counts inline, but the handler ships the bare row.

## Proposal

Extend the `GET /items/:id` response with an optional enrichment block (gate behind a query flag like `?expand=detail` to keep the cheap row read for list-row hydration):

- `locationPath: Location[]` — root → location ancestor chain (same shape `/locations/:id/path` already returns; reuse the locations service).
- `connectionCount: number` — count of rows where the item is on either side of `item_connections`.
- `photoCount: number` — count of `item_photos` for the item.

## Acceptance criteria

- [ ] `GET /items/:id?expand=detail` returns `{ data: Item, locationPath, connectionCount, photoCount }`.
- [ ] Without the flag the response is unchanged (bare item row), so list hydration stays cheap.
- [ ] `locationPath` is empty when `location_id` is NULL; counts are 0 (not null) when there are none.
- [ ] Counts come from a single aggregate query each (no N+1), reusing the existing connections/photos services.
- [ ] Tests cover: enriched vs bare response, orphaned item (no location), item with zero connections/photos.
