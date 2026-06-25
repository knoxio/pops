# Warranty Tracking

> Status: Done. Tier thresholds (30/60/90) are hardcoded; making them a user setting is carved out to [ideas/configurable-warranty-threshold.md](../ideas/configurable-warranty-threshold.md).

A warranties page at `/inventory/warranties` that surfaces every inventory item with a warranty expiry, grouped into urgency tiers with colour coding. The list is fetched in one call; tier assignment and `daysRemaining` are computed client-side from the current date.

## Data

Source of truth is the `home_inventory` table in the inventory pillar's SQLite DB. Only the denormalised `warranty_expires` column (a `YYYY-MM-DD` date string) drives this feature — there is no separate warranty entity. Warranty documents come from the `item_documents` relation table: a row with `document_type = 'warranty'` carries the linked Paperless `paperless_document_id`.

## REST API surface

Served by the inventory pillar's ts-rest contract (`reports.*` sub-router).

| Endpoint                  | Returns                                                                                                                                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /reports/warranties` | `{ data: WarrantyItem[] }` — every item with `warrantyExpires` set, sorted by expiry ascending. `WarrantyItem` is the full inventory item plus `warrantyDocumentId: number \| null` (left-joined from `item_documents` where `document_type = 'warranty'`). |
| `GET /paperless/status`   | `{ data: { configured, available, baseUrl } }` — used to build warranty document links and to gracefully hide them when Paperless is down.                                                                                                                  |

The server does NOT compute tiers or days-remaining; it only filters to `warrantyExpires IS NOT NULL` and sorts. The client groups.

- [x] `GET /reports/warranties` returns only items with a warranty date, sorted by expiry ascending, each carrying `warrantyDocumentId`.
- [x] Items with no warranty date are excluded entirely from the response.

## Tiers (computed client-side)

`daysRemaining = warrantyExpires − today` in whole calendar days (local midnight). Each item is bucketed:

| Tier     | Condition        | Colour                  | Section behaviour                                           |
| -------- | ---------------- | ----------------------- | ----------------------------------------------------------- |
| Critical | `0 ≤ days < 30`  | Red (destructive)       | Always rendered, not collapsible                            |
| Warning  | `30 ≤ days < 60` | Yellow/orange (warning) | Always rendered, not collapsible                            |
| Caution  | `60 ≤ days ≤ 90` | Orange                  | Always rendered, not collapsible                            |
| Active   | `days > 90`      | Green (success)         | Collapsible, open by default                                |
| Expired  | `days < 0`       | Muted                   | Collapsible, collapsed unless it is the only populated tier |

- [x] Items grouped into the five tiers above from `daysRemaining`; an item with an unparseable warranty date is skipped.
- [x] Within each tier, items are sorted by `daysRemaining` ascending (most urgent first); expired sorted by least-recently expired first.
- [x] A warranty expiring today (`days = 0`) lands in Critical; exactly 90 days lands in Caution.
- [x] Empty tiers render nothing (no heading, no "no items" placeholder).
- [x] Critical/Warning/Caution headers show a coloured pulsing dot, the tier label, and an item-count badge.
- [x] Active section is collapsible and open by default; Expired is collapsible and collapsed by default, but opens when no expiring or active items exist (it is the only group).

## Item row

- [x] Shows item name (primary) and a `brand model` subtitle (muted, `text-xs`) that is hidden when both brand and model are null.
- [x] Shows the `AssetIdBadge` when the item has an asset ID.
- [x] Shows the warranty expiry date via the shared `formatDate` helper, and the replacement value via `formatAUD` when present.
- [x] Days-remaining indicator: in expiring tiers a coloured urgency badge (`destructive ≤14d`, `secondary ≤30d`, else `outline`); in Active a green outline badge; in Expired a muted "Nd ago" label.
- [x] Clicking a row navigates to the item detail page (`/inventory/items/:id`).
- [x] A "View Warranty" link to the Paperless document (`{baseUrl}/documents/{warrantyDocumentId}/details`, new tab) appears only when the item has a `warrantyDocumentId` AND Paperless reports available; otherwise the link is absent (not disabled). Clicking it does not trigger the row navigation.

## Page states

- [x] Loading: skeleton placeholders while the warranties query is in flight.
- [x] Empty (zero items returned): "No items with warranty dates…" message plus a "Browse Items" link to `/inventory/items`; shown only after load, never during loading.
- [x] Error (query failed or the pillar is unavailable): "Could not load warranties — try again" with a Retry button that re-fetches.
- [x] Page header titled "Warranty Tracking" with a shield icon; route reachable from the inventory nav.

## Out of scope

Warranty-expiry notifications/push alerts, automated warranty-date extraction from receipts, extended-warranty purchase tracking, depreciation, and a configurable "expiring soon" threshold (see the linked idea).
