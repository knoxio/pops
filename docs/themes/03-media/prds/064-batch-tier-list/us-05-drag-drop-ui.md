# US-05: Drag-and-drop tier list UI

> PRD: [064 — Batch Tier List](README.md)
> Status: Not started

## Description

As a user, I want to drag movies into S/A/B/C/D tier rows to rank them quickly on a single dimension.

## Acceptance Criteria

- [ ] Route: `/media/tier-list`
- [ ] Dimension selector at top (dropdown or chip selector)
- [ ] 5 tier rows (S/A/B/C/D) as horizontal drop zones with tier label on the left
- [ ] Unranked pool at the bottom with the 8 movie cards
- [ ] Movie cards show poster thumbnail + title, draggable
- [ ] Drag between tiers to reposition, drag back to unranked to remove
- [ ] "Refresh" button to get a different set of 8 movies
- [ ] "Submit" button disabled when fewer than 2 movies placed
- [ ] Tests: drag and drop works, tier assignment persists, submit enables at 2+
