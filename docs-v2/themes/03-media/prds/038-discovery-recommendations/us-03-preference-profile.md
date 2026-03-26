# US-03: Preference profile

> PRD: [038 — Discovery & Recommendations](README.md)
> Status: To Review

## Description

As a user, I want to see a visual breakdown of my genre affinities and dimension weights so that I can understand my movie preferences.

## Acceptance Criteria

- [ ] Preference profile section renders on the `/media/discover` page (below recommendations or as a collapsible panel)
- [ ] Section is hidden when the user has no library items (nothing to compute preferences from)
- [ ] Genre distribution: bar chart or weighted tag cloud showing movie count per genre from the library
- [ ] Genre affinity: ranked list of genres weighted by the average Elo score of movies in each genre
- [ ] Genres with higher average Elo scores rank higher in the affinity list
- [ ] Dimension weights: visualisation showing which dimensions have the most comparison activity and score variance
- [ ] All data is fetched via `media.discovery.profile` as a single computed response
- [ ] Genre distribution uses all library movies; genre affinity uses only movies with at least one comparison
- [ ] If no comparisons exist, genre affinity and dimension weights sections show "Compare movies to see your preferences" with CTA to arena
- [ ] Genre distribution still displays even without comparisons (based on library contents)
- [ ] Visual style uses charts or data visualisation — not plain tables
- [ ] Loading state: skeleton charts while profile data computes
- [ ] Tests cover: genre distribution bar chart renders with correct counts, genre affinity ranks by average Elo, dimension weights render, empty comparison state shows CTA, profile hidden with empty library

## Notes

The preference profile is a read-only view — there are no actions to take. It updates automatically as the user adds movies and records comparisons. Genre affinity is the key insight — it tells the user "you rate action movies higher than dramas" based on their actual comparison behaviour, not self-reported preferences. The dimension weights section is secondary and can be simpler (e.g., a small bar chart showing comparison counts per dimension).
