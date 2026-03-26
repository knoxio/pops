# Theme: Media

> Learn what I like, then tell me what to watch next.

## Strategic Objective

Build a personal media intelligence app — not just a tracker, but a system that learns preferences and surfaces recommendations. The core loop: watch something, rate it through quick 1v1 comparisons, the system refines its model of your taste, better suggestions appear. Output exceeds input.

## Success Criteria

- Adding a movie or show requires zero manual metadata entry — TMDB and TheTVDB provide everything
- Library and watch history are POPS-owned — Plex sync is one input source, not the only one
- 1v1 comparisons are fast (two taps) and enjoyable across multiple taste dimensions
- Recommendations use watch history, comparison data, and genre preferences — and improve over time
- "What should I watch tonight?" gives useful, personalised answers
- Recommendations flow into action — request content directly through Radarr/Sonarr from within POPS

## Epics

| # | Epic | Summary | Status |
|---|------|---------|--------|
| 0 | [Data Model & API](epics/00-data-model-api.md) | Split tables (movies, shows, seasons, episodes), comparisons schema, tRPC routers | Done |
| 1 | [Metadata Integration](epics/01-metadata-integration.md) | TMDB (movies) and TheTVDB (TV) — search, metadata fetch, poster cache, rate limiting | Done |
| 2 | [App Package & Core UI](epics/02-app-package-ui.md) | `@pops/app-media` — routes, pages, browse/search/detail views | Done |
| 3 | [Tracking & Watchlist](epics/03-tracking-watchlist.md) | Watch history, watchlist management, episode-level progress | Done |
| 4 | [Ratings & Comparisons](epics/04-ratings-comparisons.md) | 1v1 pairwise comparisons, ELO scoring, rankings, radar charts | Done |
| 5 | [Discovery & Recommendations](epics/05-discovery-recommendations.md) | Trending, new releases, personalised suggestions | Done |
| 6 | [Plex Sync](epics/06-plex-sync.md) | Library import, watch history sync via polling | Done |
| 7 | [Radarr & Sonarr](epics/07-radarr-sonarr.md) | Status display, request management — evolves toward full Overseerr replacement | Done (status only; request management not started) |

Epic 0 is prerequisite to everything. Epic 1 prerequisite to 2. Epics 3-4 parallel after 2. Epic 5 depends on 4. Epics 6-7 parallel after 3.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Schema | Split tables per media type | TV hierarchy (show/season/episode) is fundamentally different from movies |
| Movie metadata | TMDB | Industry standard, Radarr-aligned |
| TV metadata | TheTVDB | Plex and Sonarr's native agent |
| Rating system | Pairwise ELO | More engaging than stars, richer taste profile |
| Comparison dimensions | User-configurable | Stored as data, not code |
| Pair selection | Random (v1) | Simple. Smart selection is a future enhancement |
| Poster storage | Local cache | ~1 GB for a large library, no external dependency at render time |
| Plex sync | Polling | Simpler than webhooks, no network config |
| Radarr/Sonarr | Status + request management | Starts read-only, evolves to full request/management (replacing Overseerr) |
| Library ownership | POPS-owned, multi-source | Library and watch history live in POPS — Plex, manual add, and future sources feed into it |

## Risks

- **External API dependency** — TMDB/TheTVDB rate limits or downtime. Mitigation: cache in SQLite, fetch once on add
- **Recommendation cold start** — Needs comparison data before suggesting. Mitigation: seed with community ratings, make comparisons engaging
- **Plex API instability** — Semi-official, changes without notice. Mitigation: isolate behind service boundary
- **Comparison fatigue** — If it feels like a chore, data never accumulates. Mitigation: 2 taps, contextual surfacing, never forced

## Out of Scope

- Music tracking
- Streaming service aggregation
- Social features (shared reviews, public profiles)
- Direct torrent/download management (Radarr/Sonarr handle that — POPS sends requests to them)
- Live TV, sports, news, games
