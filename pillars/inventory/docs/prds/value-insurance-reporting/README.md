# Value & Insurance Reporting

Status: Done — dashboard, value breakdowns, insurance report, browser print-to-PDF and CSV export all shipped. Per-item resale value / model / purchase date in the insurance report are not built (see [insurance-report-extra-fields](../../ideas/insurance-report-extra-fields.md)).

A reporting hub for the inventory pillar: a summary dashboard (counts, total values, expiring warranties, recently edited), replacement-value breakdowns by location and type, and an insurance-ready item report grouped by location with photos and linked receipts. The report prints cleanly via the browser's native print-to-PDF and exports to CSV. No server-side document generation.

## Routes (inventory app, mounted under `/inventory`)

- `/inventory/reports` — dashboard hub (`ReportDashboardPage`): widgets, value breakdowns, link to the insurance report.
- `/inventory/reports/insurance` — insurance report (`InsuranceReportPage`).
- Legacy `/inventory/report` and `/inventory/report/insurance` redirect to the plural paths, preserving the query string.

## Data

All reads come from the inventory pillar's own SQLite DB — no cross-pillar joins. Source tables: `home_inventory` (`replacementValue`, `resaleValue`, `warrantyExpires`, `type`, `locationId`, `lastEditedTime`, item descriptors), `locations` (name, `parentId`), `item_photos` (`filePath`, `sortOrder`), `item_documents` (`paperlessDocumentId`, `documentType`). Receipt IDs are Paperless document IDs surfaced as plain `#NNNN` text, never thumbnails (print-friendly).

## REST API surface (`reports.*`, all GET, all JSON)

| Endpoint                         | Query                                                                  | Response `data`                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET /reports/dashboard`         | —                                                                      | `{ itemCount, totalReplacementValue, totalResaleValue, warrantiesExpiringSoon, recentlyAdded[] }` |
| `GET /reports/value-by-location` | —                                                                      | `{ name, totalValue, itemCount, key }[]` (key = locationId, null for Unassigned)                  |
| `GET /reports/value-by-type`     | —                                                                      | `{ name, totalValue, itemCount }[]`                                                               |
| `GET /reports/insurance`         | `locationId?`, `includeChildren?`, `sortBy?` (`value`\|`name`\|`type`) | `{ groups: { locationId, locationName, items[] }[], totalItems, totalValue }`                     |
| `GET /reports/warranties`        | —                                                                      | inventory items with a warranty expiry + `warrantyDocumentId`, sorted by expiry                   |

`recentlyAdded` item shape: `{ id, itemName, type, assetId, lastEditedTime }`. Insurance report item shape: `{ id, itemName, assetId, brand, type, condition, warrantyExpires, replacementValue, photoPath, locationId, locationName, receiptDocumentIds[] }`.

## Acceptance criteria

### Dashboard (`/inventory/reports`)

- [x] Page reachable from inventory nav ("Reports", `BarChart3` icon).
- [x] All widget data loads from a single `GET /reports/dashboard` call.
- [x] Widgets: total item count (plain number), total replacement value and total resale value (formatted AUD), warranties-expiring-soon count.
- [x] Warranties widget is amber when count > 0 and navigates to `/inventory/warranties` on click.
- [x] "Recently Added" lists the 5 most-recently-edited items (name, type badge, asset id, relative time); each row opens the item detail page. Empty inventory shows "No items yet".
- [x] Values come back as `COALESCE(SUM(...), 0)` so null `replacementValue`/`resaleValue` contribute 0; empty inventory yields all zeros.
- [x] Responsive 2-column stat grid; recently-added and both breakdown cards span full width below; skeletons while loading.
- [x] If the pillar is unavailable, the dashboard renders nothing rather than erroring.

### Value breakdowns (on the dashboard)

- [x] "Value by Location" and "Value by Type" cards, each loading from its own endpoint.
- [x] Each entry shows name, replacement-value total, and item count; entries sorted by total value descending.
- [x] Items with no location group under "Unassigned"; items with no type group under "Uncategorized".
- [x] Rendered as a horizontal bar chart; the tooltip formats a $0 entry as an em-dash; an all-zero / empty dataset shows "No items with replacement values".
- [x] Clicking a location bar navigates to `/inventory?locationId=…` (when the entry has a location key); clicking a type bar navigates to `/inventory?type=…`.
- [x] Per-card loading skeleton and a retry-able error state.
- [x] Items with null `replacementValue` are counted but add 0 to the value total.

### Insurance report (`/inventory/reports/insurance`)

- [x] Location filter via `LocationPicker` (tree); default "All locations" → full inventory.
- [x] "Include sub-locations" checkbox shown only when a location is selected; descendants resolved by walking the location subtree (BFS over `parentId`), default on.
- [x] Sort selector: "Value (high first)" (default), "Name", "Type"; filters persist in the URL query string.
- [x] Header reads "Insurance Report", with a "Generated [long date]" line that appends the location name when a single-location report is shown.
- [x] Items grouped by location; groups sorted alphabetically with the no-location group last. Each group is a table: photo, name, asset id, brand, condition, warranty badge, replacement value, receipt ids; per-group subtotal footer when any item has a value.
- [x] Warranty status derived from `warrantyExpires`: "None", "Expired", "Nd left" (≤90 days), or the formatted expiry date.
- [x] Primary photo = the item's lowest-`sortOrder` photo (`/inventory/photos/<filePath>`); items without a photo render a labelled placeholder.
- [x] Receipts = `item_documents` rows with `documentType = 'receipt'`, shown as `#1234, #5678` (or em-dash).
- [x] Replacement value shows AUD or em-dash when null; summary panel shows total items and total replacement value for the selected scope.
- [x] Loading skeleton; empty result shows "No inventory items found"; load failure shows "Failed to load report".
- [x] Row click opens the item detail page.

### Print & export

- [x] "Print / PDF" button calls `window.print()`; no server-side PDF generation.
- [x] `@media print` (Tailwind `print:` utilities) hides nav, report filters and action buttons; prints only header, summary and item tables.
- [x] Each location group after the first starts on a new page (`print:break-before-page`); rows and photos use `break-inside-avoid`.
- [x] Print typography tuned: ~11pt body, 14pt section headers; badge backgrounds dropped to transparent; gray table borders added; photos capped at `print:max-w-50`.
- [x] "Export CSV" downloads a UTF-8 BOM CSV (location, name, asset id, brand, condition, warranty expiry, replacement value, photo yes/no, receipts) named `insurance-report-<date>.csv`.

## Business rules

- Warranty "expiring soon" window is a fixed 90 days; `warrantiesExpiringSoon` counts items whose `warrantyExpires` falls within `[today, today+90d]`.
- Breakdowns and report totals use `replacementValue` only; nulls count toward item counts but not value sums.
- `includeChildren` defaults to true on the server when a `locationId` is given; sub-location resolution is in-memory subtree traversal, not a SQL CTE.
- Money totals are rounded to 2 decimals.

## Edge cases

| Case                              | Behaviour                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| Empty inventory                   | Dashboard all zeros; breakdowns show empty message; report shows "No inventory items found". |
| Item with null replacement value  | Counted everywhere; value cell / bar shows em-dash, contributes 0 to sums.                   |
| Item with no location             | Grouped under "Unassigned" (breakdowns) / "No Location" (report, sorted last).               |
| Item with no photos / no receipts | Placeholder photo cell / em-dash receipts cell.                                              |
| Large inventory printed           | Per-location page breaks plus `break-inside-avoid` prevent split rows/photos.                |
| Pillar unavailable                | Dashboard and breakdown cards render nothing instead of erroring.                            |

## Out of scope

- Server-side PDF generation, insurance claim submission, depreciation, historical value tracking over time.
- Per-item resale value, model and purchase date in the insurance report (dashboard-level resale total exists) — tracked in [insurance-report-extra-fields](../../ideas/insurance-report-extra-fields.md).
