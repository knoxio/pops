# US-02: Warranty item rows

> PRD: [050 — Warranty Tracking](README.md)
> Status: Partial

## Description

As a user, I want each warranty item to show its key details and days remaining so that I can assess warranty status without navigating to the item detail page.

## Acceptance Criteria

- [ ] Each item row displays: item name, asset ID, brand, model — in a compact layout — brand, model, and asset ID missing from row
- [x] Warranty expiry date shown in localised format (e.g., "15 Jun 2027")
- [x] Days remaining calculated and displayed: "X days left" for active, "Expired X days ago" for expired
- [x] Days remaining text colour matches the tier colour (red/yellow/orange/green/grey)
- [x] Item name is a clickable link — navigates to the item detail page
- [x] Warranty document link shown if an `item_documents` row exists with tag "warranty" — "View Warranty" link opens the Paperless document
- [x] Warranty document link absent (not shown, not disabled) if no warranty document linked
- [x] Row layout responsive: stacks vertically on mobile, horizontal on desktop
- [ ] Brand and model shown as secondary text (smaller, muted) — hidden if both are null — not implemented

## Notes

The warranty document link uses the same Paperless URL construction as the document display (PRD-049): `PAPERLESS_BASE_URL/documents/:id/details`. If Paperless is unavailable, the warranty document link is hidden (same graceful degradation pattern).
