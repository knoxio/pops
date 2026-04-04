# US-04: Debrief page

> PRD: [063 — Post-Watch Debrief](README.md)
> Status: Done

## Description

As a user, I want a dedicated debrief page where I rapidly compare a just-watched movie against one opponent per dimension.

## Acceptance Criteria

- [x] Route: `/media/debrief/:movieId`
- [x] Header: movie poster, title, year, "Debrief: {title}" heading
- [x] Dimension progress indicator: "{current} of {total}" with dimension name
- [x] Comparison layout: debrief movie (left) vs opponent (right)
- [x] Pick A / Pick B / High / Mid / Low draw buttons (same as arena)
- [x] After pick, advance to next pending dimension
- [x] "Skip this dimension" button dismisses current dimension
- [x] "Done for now" button exits, completed dimensions saved
- [x] Completion summary: per-dimension result + new score
- [x] Tests: renders, pick advances, skip dismisses, bail-out saves progress, summary shows
