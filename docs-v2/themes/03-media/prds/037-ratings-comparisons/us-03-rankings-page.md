# US-03: Rankings page

> PRD: [037 — Ratings & Comparisons](README.md)
> Status: Partial

## Description

As a user, I want to see a leaderboard of my movies ranked by Elo score so that I can see how my movie preferences shake out across different dimensions.

## Acceptance Criteria

- [x] Rankings page renders at `/media/rankings`
- [x] Dimension selector dropdown with "Overall" as default plus each active dimension
- [ ] Selecting a dimension updates the list and persists in `?dimension=` query param
- [x] Ranked list displays: rank number, poster thumbnail, title, Elo score (1 decimal place), comparison count
- [x] "Overall" ranking calculates the average score across all active dimensions for each movie
- [ ] Movies are sorted by score descending — ties broken alphabetically by title
- [ ] Movies with zero comparisons display at 1500.0 and sort alphabetically after scored movies
- [ ] List is paginated (25 items per page) with page navigation
- [x] Empty state: "No comparisons yet — start comparing" with CTA to `/media/compare`
- [x] Only movies are shown (TV comparisons are out of scope)
- [x] Page calls `media.comparisons.rankings` with optional dimension ID (omitted for overall)
- [ ] Tests cover: ranked order matches scores, overall averages correctly, dimension selector switches list, zero-comparison movies sort last alphabetically, pagination, empty state renders

## Notes

The "Overall" calculation is a simple average — if a movie has scores in 3 out of 5 dimensions, average only those 3 (not penalise for missing dimensions). Movies that have never been compared for ANY dimension still appear at 1500.0 in the overall view. Score display should show one decimal place for readability (e.g., 1532.4), though storage remains full precision.
