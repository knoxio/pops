# US-03: Debrief tRPC endpoints

> PRD: [063 — Post-Watch Debrief](README.md)
> Status: Done

## Description

As a developer, I want tRPC endpoints for the debrief flow: get pending debrief, record a debrief comparison, dismiss a dimension.

## Acceptance Criteria

- [x] `media.comparisons.getDebrief({ mediaType, mediaId })` returns: movie info, list of dimensions with status (pending/debriefed/dismissed), opponent per pending dimension
- [x] `media.comparisons.recordDebriefComparison({ mediaType, mediaId, dimensionId, winnerId, drawTier? })` records comparison via standard path, sets debriefed=1 on the debrief row
- [x] `media.comparisons.dismissDebriefDimension({ mediaType, mediaId, dimensionId })` sets dismissed=1
- [x] `media.comparisons.getPendingDebriefs()` returns list of movies with incomplete debriefs (for notifications)
- [x] All protected procedures
- [x] Tests: get returns correct status, record updates row + ELO, dismiss sets flag, pending list correct
