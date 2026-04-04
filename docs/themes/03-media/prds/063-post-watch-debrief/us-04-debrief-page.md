# US-04: Debrief page

> PRD: [063 — Post-Watch Debrief](README.md)
> Status: Not started

## Description

As a user, I want a dedicated debrief page where I rapidly compare a just-watched movie against one opponent per dimension.

## Acceptance Criteria

- [ ] Route: `/media/debrief/:movieId`
- [ ] Header: movie poster, title, year, "Debrief: {title}" heading
- [ ] Dimension progress indicator: "{current} of {total}" with dimension name
- [ ] Comparison layout: debrief movie (left) vs opponent (right)
- [ ] Pick A / Pick B / High / Mid / Low draw buttons (same as arena)
- [ ] After pick, advance to next pending dimension
- [ ] "Skip this dimension" button dismisses current dimension
- [ ] "Done for now" button exits, completed dimensions saved
- [ ] Completion summary: per-dimension result + new score
- [ ] Tests: renders, pick advances, skip dismisses, bail-out saves progress, summary shows
