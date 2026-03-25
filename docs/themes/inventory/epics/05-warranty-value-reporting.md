# Epic: Warranty, Value & Reporting

**Theme:** Inventory
**Priority:** 5 (can run after Epic 2)
**Status:** Done

## Goal

Surface warranty expiry dates proactively, provide total asset value at a glance, and generate insurance-ready reports by room or location. This is where the system starts giving back more than what you put in — the data is already there from Epics 0-2, this epic makes it actionable.

## Scope

### In scope

- **Warranty tracking:**
  - Dashboard widget or inventory home section: "Warranties expiring soon"
  - Items with warranty expiring within 30/60/90 days highlighted
  - Items with expired warranties flagged differently (not urgent, just informational)
  - Warranty status shown on item detail page and in the item list
- **Value summaries:**
  - Total replacement value across all items — always visible on the inventory home page
  - Breakdown by room: "Living Room: $12,500 | Bedroom: $8,200 | Kitchen: $3,400"
  - Breakdown by type: "Electronics: $15,000 | Appliances: $5,200 | Furniture: $3,000"
  - Filter by any combination: "Electronics in the Living Room: $9,800"
- **Insurance-ready reports:**
  - Generate a report for a room or location subtree:
    - "Everything in the bedroom" → all items under Home → Bedroom (including sub-locations)
    - Each item shows: name, brand, model, asset ID, condition, purchase date, replacement value, resale value
    - Photos included per item (first photo or all photos)
    - Linked Paperless-ngx documents referenced (receipt IDs, warranty doc IDs)
    - Total replacement value and total resale value at the bottom
  - Report format: exportable as PDF or printable HTML
  - "Full inventory report" = all items across all locations
- **Inventory dashboard** (`/inventory` home enhancement):
  - Total item count
  - Total replacement value
  - Items by room (pie chart or bar chart)
  - Warranties expiring soon (list)
  - Recently added items

### Out of scope

- Insurance claim submission or workflow
- Depreciation calculations
- Historical value tracking over time
- Automated value estimation (price lookups)
- Scheduled warranty expiry notifications (Moltbot/email — AI Inference theme)

## Deliverables

1. Warranty expiry tracking — "expiring soon" list with 30/60/90 day thresholds
2. Warranty status indicators on item detail and list views
3. Total replacement value displayed on inventory home page
4. Value breakdown by room and by type
5. Filtered value queries (room × type combinations)
6. Insurance report generation per room/location (PDF or printable HTML)
7. Full inventory report generation
8. Inventory dashboard with summary widgets
9. Unit tests for value aggregation and warranty calculations
10. `mise db:seed` updated with varied warranty dates (some expired, some expiring soon, some distant) and replacement values
11. `pnpm typecheck` and `pnpm test` pass

## Dependencies

- Epic 0 (Schema Upgrade) — warranty_expires, replacement_value, resale_value fields
- Epic 2 (App Package & Edit UI) — pages to enhance with dashboard and reports
- Epic 4 (Paperless-ngx) — optional, for including receipt references in reports

## Risks

- **PDF generation** — Generating PDFs from Node.js requires a library (puppeteer, pdfkit, or jspdf). Puppeteer is heavy (headless Chrome). Mitigation: start with printable HTML (`@media print` CSS) — the user can print-to-PDF from the browser. Add server-side PDF generation later if needed.
- **Value accuracy** — Replacement values are user-entered estimates, not market prices. Reports should clearly state values are estimates. Mitigation: label reports as "Estimated Replacement Values" — not "insured values."
- **Large report performance** — A full inventory report with 200 items and 3 photos each = 600 images in one page. Mitigation: lazy-load images, paginate the report, or use thumbnails in the report with full images available on demand.
