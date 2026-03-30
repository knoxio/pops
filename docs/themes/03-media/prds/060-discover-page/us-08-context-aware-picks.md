# US-08: Context-Aware Picks

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a user, I want movie suggestions that match the current time, day, or season so that I see contextually relevant picks like "Date Night" on Saturday evenings or "Christmas Movies" in December.

## Acceptance Criteria

- [ ] 1-2 context-aware rows render on the discover page based on current date/time
- [ ] Each row is a `HorizontalScrollRow` with a themed title and emoji
- [ ] Context collections are defined as static genre/keyword mappings:

| Collection | Trigger | TMDB Query |
|------------|---------|------------|
| Date Night | Fri-Sat, 6-10pm | genres: Romance + Comedy |
| Sunday Flicks | Sunday, all day | genres: Drama, sort: popularity |
| Late Night Thrillers | Any day, 10pm-2am | genres: Thriller + Mystery |
| Halloween | October | keywords: halloween, horror genre |
| Christmas Movies | December | keywords: christmas |
| Oscar Winners | Feb-Mar (awards season) | keywords: oscar, academy award |
| Rainy Day | Fallback / default | genres: Comedy + Drama + Animation |

- [ ] Each collection fetches from TMDB `/discover/movie` with the specified genre/keyword filters, `sort_by=vote_average.desc`, `vote_count.gte=100`
- [ ] Results exclude library movies and dismissed movies
- [ ] Supports Load More
- [ ] Collections that don't match the current date/time are not rendered
- [ ] At least one collection always matches (Rainy Day as universal fallback)
- [ ] New `media.discovery.contextPicks` tRPC query that accepts current hour/date and returns matching collections
- [ ] Time evaluation happens on the server (uses server clock, not client)
- [ ] Tests cover: time-based collection selection, genre query mapping, fallback to Rainy Day

## Notes

The trigger logic is simple conditional checks on hour-of-day and month — no external weather API or complex scheduling. The server evaluates which collections apply and returns only the matching ones. Collections can overlap (e.g., December Sunday = both Christmas and Sunday Flicks). Cap at 2 context rows to avoid overwhelming the page.
