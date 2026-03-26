# US-03: Document display

> PRD: [049 — Paperless-ngx Integration](README.md)
> Status: Partial

## Description

As a user, I want to see linked documents on the item detail page grouped by type so that I can quickly access receipts, warranties, and manuals for an item.

## Acceptance Criteria

- [x] Documents section on item detail page — only visible when Paperless health check returns `available: true`
- [x] Documents fetched via `inventory.documents.listForItem` on page load
- [x] Documents grouped by tag: "Receipts", "Warranties", "Manuals" — each group as a subsection
- [x] Empty groups hidden (don't show "Warranties" heading if no warranties linked)
- [ ] Each document card shows: thumbnail (loaded via proxy), title, tag badge, linked date — **thumbnails not shown on document cards; only title, tag badge, and linked date displayed**
- [ ] "View in Paperless" link on each card — opens the Paperless web UI for that document in a new tab (`PAPERLESS_BASE_URL/documents/:id/details`) — **not implemented**
- [x] "Unlink" action on each card (same as US-02 unlink)
- [ ] Thumbnail loading: skeleton placeholder while thumbnail fetches — **not applicable since thumbnails not rendered**
- [ ] Thumbnail error: "Document unavailable" placeholder if Paperless returns 404 for the thumbnail (document deleted externally) — **not applicable since thumbnails not rendered**
- [x] Section hidden entirely when Paperless is unavailable — no error message, no empty state, just absent
- [x] Section hidden when item has no linked documents and Paperless is available — the "Link Document" button (from US-02) is the entry point

## Notes

The documents section shares the same health check result as the "Link Document" button — fetch health once on page load, use the result for both. Thumbnails are small (150x200px or similar) to keep page load reasonable. The "View in Paperless" URL is constructed client-side from the base URL and document ID.
