# Media — Future Ideas

Enhancements that are out of scope for v1 but worth revisiting once the core is solid.

## TV Show Comparisons

v1 comparisons are movies-only. TV shows present a hard UX problem: seasons within a show vary dramatically in quality (GoT S1 vs S7 are different products), so comparing at the show level is meaningless. But season-level comparisons create a sprawling cross-show space (GoT S2 vs Modern Family S7 vs Outlander S1). Needs its own design pass — possible approaches include season-level comparisons within a genre, show-level comparisons for "overall vibe" dimensions only, or a separate TV ranking system entirely. The schema already supports TV comparisons via `media_type` columns.

## AI-Driven Comparisons

Use Claude Haiku to generate comparison prompts automatically. Instead of random "Movie A vs Movie B" pairs, the AI picks dimensions and pairings that would be most informative for refining the preference profile. Could also generate novel dimensions based on what it knows about the films ("Which felt more claustrophobic?", "Which had the better twist?").

## Smart Pair Selection

Replace random pair selection with uncertainty-based matching. The system identifies which movies it's least confident about ranking and prioritises those for comparisons. Cross-genre comparisons map preferences faster (comparing a thriller to a comedy reveals more than comparing two thrillers).

## Advanced Recommendation Algorithm

Evolve beyond simple weighted scoring:
- Content-based filtering on metadata from TMDB/TheTVDB (director, cast, keywords, production company)
- Correlation with community ratings to infer taste alignment
- Mood-based suggestions ("I want something light" vs "I want something intense")
- Temporal patterns (what genres you prefer on weekdays vs weekends, seasons)

## Plex User Rating Import for Recommendations

The Plex API exposes per-item `rating` (user's own star rating) and `audienceRating` (community rating). The Plex client already maps these fields (`PlexMediaItem.rating`, `PlexMediaItem.audienceRating`) but the sync service discards them. These could be stored and used as additional signals in the recommendation algorithm (PRD-014 R3).

Possible approaches:
- **Direct signal in scoring:** Add `plex_user_rating × weight` to the recommendation score formula alongside `genre_affinity_match` and `tmdb_vote_average`. Plex user ratings are an explicit taste signal — arguably more valuable than TMDB community ratings.
- **ELO seed:** Use Plex star ratings to seed initial ELO scores in the comparison system, reducing the cold-start problem. A 5-star Plex rating maps to a higher starting ELO than a 2-star.
- **Preference profile enrichment:** Plex ratings reveal genre preferences without requiring comparisons. A user who rates all their thrillers 4-5 stars and comedies 2-3 stars has a clear genre affinity that the recommendation engine can use immediately.

Requires: a `plex_ratings` table or a `userRating` column on the `movies` / `tv_shows` tables, populated during Plex sync.

## Plex Continue Watching / Watch Progress

The Plex API provides `viewOffset` (milliseconds into playback) on partially-watched items. This powers the "Continue Watching" shelf in Plex. Currently not captured — the `RawPlexMediaItem` and `RawPlexEpisode` types don't include `viewOffset`, and the sync only tracks binary watched/unwatched via `viewCount`.

Capturing `viewOffset` would enable:
- A "Continue Watching" section in POPS showing in-progress movies/episodes with progress bars
- More accurate watch history (distinguish "watched 10 minutes and stopped" from "watched the whole thing")
- Better recommendation signals (abandoning a movie halfway is a negative signal)

Note: Epic 03 and PRD-012 explicitly scope out "Currently watching" / in-progress tracking. This would be a v2 feature.

## Plex Webhooks

Upgrade from polling to real-time Plex webhooks (requires Plex Pass, already available). Instant watch status updates when something finishes playing.

## Full Radarr/Sonarr Management UI

Extend the read-only status display to a full management interface. Request new movies/shows, add to monitored lists, select quality profiles, trigger searches, configure settings — without leaving POPS. Includes both requesting (Epic 7 follow-up) and configuration management.

## Watch Party / Shared Watchlist

Shared watchlist with a partner — "we both want to watch this." Not social in the public sense, just coordinating what to watch together vs solo.
