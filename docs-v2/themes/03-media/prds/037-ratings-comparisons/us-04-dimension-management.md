# US-04: Dimension management

> PRD: [037 — Ratings & Comparisons](README.md)
> Status: To Review

## Description

As a user, I want to manage comparison dimensions (add, edit, deactivate) so that I can customise which taste dimensions my movies are compared across.

## Acceptance Criteria

- [ ] Dimension management UI accessible from the rankings or compare page (settings/gear icon or dedicated section)
- [ ] List all dimensions ordered by `sortOrder`, showing name, description, active status
- [ ] Create new dimension: name (required, unique), description (optional), sortOrder (required)
- [ ] Edit existing dimension: update name, description, sortOrder
- [ ] Toggle active/inactive status — deactivated dimensions are greyed out in the list
- [ ] Deactivated dimensions are excluded from the arena's dimension rotation
- [ ] Deactivated dimensions are excluded from the "Overall" ranking calculation
- [ ] Deactivated dimensions retain their comparison history and scores (not deleted)
- [ ] Cannot delete a dimension — only deactivate (preserves historical data)
- [ ] Name uniqueness validated — duplicate name shows an error message
- [ ] Sort order can be updated by reordering the list (similar to watchlist reorder)
- [ ] Default dimensions (Cinematography, Entertainment, Emotional Impact, Rewatchability, Soundtrack) are seeded on first use
- [ ] Tests cover: create dimension, edit dimension, toggle active status, sort order update, name uniqueness error, deactivated dimension excluded from arena rotation, deactivated excluded from overall ranking

## Notes

Dimension management is a secondary feature — it should not dominate the compare or rankings UI. A modal or side panel is appropriate. The 5 default dimensions should be seeded either via a database migration or on first access of the comparison feature. Deactivation is preferred over deletion to preserve the integrity of historical comparison data.
