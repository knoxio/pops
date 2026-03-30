# US-08: Arena watchlist button and filter

> PRD: [037 — Ratings & Comparisons](README.md)
> Status: Not started

## Description

As a user, I want to add a movie to my watchlist from the compare arena and have watchlisted movies excluded from future pairs, so that I don't keep skipping movies I've queued for a rewatch.

## Acceptance Criteria

- [ ] Each movie card in the compare arena shows a small "Add to Watchlist" button (bookmark icon)
- [ ] Clicking the button adds the movie to the watchlist via `media.watchlist.add`
- [ ] Success toast confirms: "{Movie title} added to watchlist"
- [ ] After adding, the button changes to a filled bookmark (already on watchlist) and is disabled
- [ ] Movies already on the watchlist show the filled bookmark on load (check watchlist status)
- [ ] `getRandomPair` excludes movies that are on the user's watchlist from the candidate pool
- [ ] If adding to watchlist reduces the pool below 2 eligible movies, show "Not enough movies — some are on your watchlist" with a link to the watchlist page
- [ ] Skip button still works independently of the watchlist button
- [ ] Tests cover: watchlist button adds movie, pair selection excludes watchlisted movies, pool depletion message

## Notes

The use case: two movies appear but you haven't seen one in a while. You add it to the watchlist (to rewatch later) and skip the comparison. The filter prevents that movie from appearing in future pairs until you watch it and it leaves the watchlist.

The watchlist filter is applied in the `getRandomPair` service function — filter the watched movies list to exclude any whose IDs are also in `media_watchlist`.
