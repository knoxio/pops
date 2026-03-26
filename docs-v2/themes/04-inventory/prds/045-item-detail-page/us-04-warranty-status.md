# US-04: Warranty status indicator

> PRD: [045 — Item Detail Page](README.md)
> Status: To Review

## Description

As a user, I want a colour-coded warranty status indicator on the item detail page so that I can immediately see whether an item is under warranty, expiring soon, or expired without checking dates manually.

## Acceptance Criteria

- [ ] Warranty status indicator renders in the item detail header area or metadata section
- [ ] Expired warranty (warrantyExpiry < today): red badge with text "Expired"
- [ ] Expiring soon (warrantyExpiry is within 90 days from today): yellow badge with text "Expires in X days" where X is the number of days remaining
- [ ] Active warranty (warrantyExpiry > 90 days from today): green badge with text "Warranty until DATE" where DATE is the formatted expiry date
- [ ] No warranty (warrantyExpiry is null): grey badge with text "No warranty"
- [ ] Warranty expiry date is today: yellow badge showing "Expires in 0 days" (treated as expiring soon)
- [ ] Day count is calculated as calendar days, not business days
- [ ] Badge colours use semantic design tokens (not hardcoded hex values)
- [ ] Warranty status is computed client-side from the warrantyExpiry field and the current date
- [ ] Tests cover: expired state, expiring soon (1 day, 45 days, 89 days, 90 days boundary), active state, no warranty state, today boundary case

## Notes

The 90-day threshold for "expiring soon" is a fixed value for now. A future story in Epic 05 may make this configurable. The warranty status indicator is a self-contained component that takes a warrantyExpiry date (or null) and renders the appropriate badge — it can be reused in list views later.
