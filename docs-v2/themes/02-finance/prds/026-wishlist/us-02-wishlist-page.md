# US-02: Wishlist page

> PRD: [026 — Wishlist](README.md)
> Status: To Review

## Description

As a user, I want a wishlist page showing my savings goals with progress so that I can track what I'm saving for.

## Acceptance Criteria

- [ ] DataTable with columns: Item (with external link icon if URL), Priority (badge), Target Amount, Saved Amount, Progress (progress bar + percentage), Actions (dropdown)
- [ ] Search by item name
- [ ] Filter by priority
- [ ] Progress bar: `(saved / target) * 100`, hidden if either is null
- [ ] External link: clicking item name opens URL in new tab (if URL exists)
- [ ] Loading skeleton and empty state

## Notes

Progress bar uses the `Progress` component from @pops/ui. Colour-coded: green when >= 100%.
