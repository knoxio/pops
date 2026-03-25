# Theme: Media

> Learn what I like, then tell me what to watch next.

## Strategic Objective

Build a personal media intelligence app — not just a tracker, but a system that learns preferences and surfaces recommendations. The core value loop: watch something → rate it through quick 1v1 comparisons → the system refines its understanding of your taste → better suggestions appear. Output exceeds input.

TMDB provides movie metadata, TheTVDB provides TV show metadata. Plex syncs watch history automatically. Radarr and Sonarr surface download status. POPS owns the preference model: what you've watched, how you rate it across dimensions (cinematography, rewatchability, fun, emotional impact), and what that implies about what you'd enjoy next.

This is the first app post-Foundation. It validates every platform pattern: workspace packages, shell routing, API modules, and cross-domain linking. If the Foundation abstractions are wrong, this is where we find out.

## Success Criteria

- Adding a movie or show to the library requires zero manual metadata entry — TMDB (movies) and TheTVDB (TV) provide everything
- Plex watch history syncs automatically — if it's been watched on Plex, POPS knows
- The 1v1 comparison system makes rating enjoyable and fast — two taps per comparison, across multiple taste dimensions
- The recommendation engine uses watch history, comparison data, and genre preferences to suggest what to watch next — and improves over time
- A "what should I watch tonight?" flow gives useful, personalized answers without the user having to think
- The app works as a `@pops/app-media` workspace package plugged into the shell, proving the multi-app architecture

## Epics (ordered by dependency)

| # | Epic | Summary | Status |
|---|------|---------|--------|
| 0 | [Data Model & API Module](epics/00-data-model-api.md) | Split tables (movies, shows, seasons, episodes), comparisons schema, tRPC routers | Done |
| 1 | [Metadata Integration](epics/01-metadata-integration.md) | Service layer for TMDB (movies) and TheTVDB (TV) — search, metadata fetch, poster management | Done |
| 2 | [App Package & Core UI](epics/02-app-package-ui.md) | `@pops/app-media` workspace package, routes, pages, browse/search/detail views | Done |
| 3 | [Tracking & Watchlist](epics/03-tracking-watchlist.md) | Watch history, watchlist management, episode-level progress tracking | Done |
| 4 | [Ratings & Comparisons](epics/04-ratings-comparisons.md) | 1v1 pairwise comparison system across taste dimensions, ELO-style scoring | Done |
| 5 | [Discovery & Recommendations](epics/05-discovery-recommendations.md) | Preference profile from comparisons, genre weighting, personalized suggestions | Done |
| 6 | [Plex Sync](epics/06-plex-sync.md) | Import library and watch history from Plex, keep in sync via polling | In Progress |
| 7 | [Radarr & Sonarr](epics/07-radarr-sonarr.md) | Read-only status display — what's monitored, what's downloaded | Done |

Epic 0 is prerequisite to everything. Epic 1 is prerequisite to 2. Epics 3 and 4 can run in parallel after 2. Epic 5 depends on 4. Epics 6 and 7 can run in parallel after 3.

## Key Decisions to Make

These need to be resolved in PRDs or ADRs before implementation:

1. **Comparison dimensions** — Which taste dimensions to compare on? Candidates: cinematography, fun, emotional impact, rewatchability, soundtrack, acting, plot. Too many makes comparisons tedious. Too few gives a shallow preference profile. Probably 4–6 dimensions, user-configurable. Specific dimensions to be defined in the PRD.
2. **Recommendation algorithm** — Start with simple weighted scoring (genre affinity × dimension scores). Evolve over time as data accumulates — more sophisticated approaches (content-based filtering on metadata, community rating correlation) are future enhancements.
3. **Metadata sources: split by type** — TMDB for movies, TheTVDB for TV shows. Aligns with Plex, Sonarr, and Radarr's native metadata agents.

## Resolved Decisions

Decisions already made through discussion:

1. **Split tables** — Separate `movies`, `tv_shows`, `seasons`, `episodes` tables. TV's hierarchy (show → season → episode) is fundamentally different from movies. No discriminated union.
2. **Episode-level tracking** — Track at episode granularity. Data volume is trivial (~8,100 rows for 2,500 movies + 100 shows with full episode data, ~10 MB in SQLite).
3. **Media items are not entities** — Movies/shows are domain-specific records, not shared POPS entities. Actors, directors, and production companies stay as external metadata (TMDB/TheTVDB) — no cross-domain value in making them entities.
4. **Radarr/Sonarr: lightweight** — Read-only status display (what's monitored, what's downloaded). No management UI. Full request/configuration management is a future enhancement.
5. **Poster storage: local cache** — Download posters from TMDB/TheTVDB and serve via the API. ~1 GB for a large library (2,500 movies + shows). Eliminates external API dependency at render time and enables offline access.
6. **Comparison pair selection: random** — Start with random pair selection. Smart selection (uncertainty-based, cross-genre mapping) is a future enhancement.
7. **Plex sync: polling** — Start with polling (simpler, no network config). Plex Pass webhooks available as a future enhancement for real-time sync.
8. **Comparison dimensions: configurable** — Dimensions are user-configurable. Start with a curated default set (TBD in PRD). The system stores dimensions as data, not code — adding/removing dimensions doesn't require a code change.

## Risks

- **Foundation gaps** — This is the first app on the platform. If shell extraction (Foundation Epic 2) or API modularisation (Foundation Epic 3) aren't solid, media is the canary. Mitigation: start with data model and TMDB integration (backend-only), which don't depend on the shell.
- **External API dependency** — Movie metadata comes from TMDB, TV metadata from TheTVDB. Rate limits, API changes, or downtime break search and metadata fetch. Mitigation: cache aggressively in SQLite, fetch once on add, refresh on demand.
- **Recommendation cold start** — The comparison engine needs data before it can recommend. With zero comparisons, suggestions are generic. Mitigation: seed with community ratings and genre preferences until enough comparisons accumulate. Make the comparison flow engaging enough that building data feels like using the app, not feeding it.
- **Plex API instability** — Plex's API is semi-official and changes without notice. Mitigation: isolate behind a service boundary so it can be disabled without affecting the core app.
- **Comparison fatigue** — If comparisons feel like a chore, the preference engine never gets enough data. Mitigation: keep comparisons to 2 taps, surface them contextually (after watching something, on the home screen), never force them.

## Out of Scope

- Music tracking (different domain, different APIs — potential future app)
- Streaming subscriptions or service aggregation (no active subscriptions; JustWatch territory)
- Social features (shared reviews, friend activity, public profiles)
- Downloading or torrent management (Radarr/Sonarr's domain — POPS only surfaces status)
- Live TV, sports, or news tracking
- Game tracking (different enough to warrant its own app)

