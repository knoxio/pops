# Shelf Discovery — polish (item jitter, refresh fade, true franchise detection)

Forward-looking refinements split out of the shipped shelf-based discovery system. The shelf pipeline (generate → score → weighted-random select → fetch → filter → record impressions) and all 29 shelf definitions exist; these three pieces were specced but never built.

## Item-level jitter within a shelf

Today the page "feels different" between visits purely from shelf-level weighted-random selection plus freshness. Item ordering inside a shelf is deterministic (profile score / TMDB order / local query order). The original design called for jittering each item's score by a random factor in `[0.8, 1.2]` before sorting, so even a re-shown shelf presents a different item order.

- Apply jitter at fetch time in the shelf `query` (or in a shared wrapper) so it affects both the assembled first page and `getShelfPage`.
- Keep it stable within a single session/page so "Show more" doesn't reorder already-rendered items — e.g. seed the jitter per shelf instance per session.
- Test: same shelf, two sessions → different top-N ordering; pagination within a session stays consistent.

## Refresh fade transition

The Refresh button re-runs assembly and swaps the shelves in place. The spec asked for a smooth transition: existing shelves fade out, new shelves fade in, no jarring flash.

- Cross-fade the old/new shelf sets on refetch (CSS transition or a small animation lib already in the shell).
- Keep the button disabled during the fetch (already done).

## True franchise detection

`franchise-completions` currently approximates "finish the series" with genre overlap against watched movies. The real feature: detect partially-watched TMDB collections (e.g. 2 of 3 LOTR) and surface the missing entries.

- Persist `belongs_to_collection` (from the TMDB `/movie/{id}` response) on the movies row.
- Shelf logic: group library movies by collection, find collections where some are watched and some are not, surface the unwatched entries.
- Title becomes "Finish the Series" with the collection name, ranked by how close to completion.

## Out of the original spec, already shipped (for reference)

Weighted-random shelf selection, freshness scoring with a 0.1 floor, variety/context bonuses, category caps, the impressions table + REST sub-router, lazy-loaded shelf rows, and the `/media/calendar → /media/discover` redirect are all live — see `../prds/shelf-discovery.md`.
</content>
