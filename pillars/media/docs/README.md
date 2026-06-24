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

## PRD Index

**Data Model & API**

The media domain schema (movies, TV hierarchy, comparisons, scores, watchlist, watch history) and the REST contract every other area builds on.

| #   | PRD                                                     | Status |
| --- | ------------------------------------------------------- | ------ |
| 028 | [Media Data Model & API](prds/data-model-api/README.md) | Done   |

**Metadata Integration**

External metadata clients — TMDB for movies, TheTVDB for TV — each handling search, metadata fetch, poster download/cache, and rate limiting.

| #   | PRD                                             | Status |
| --- | ----------------------------------------------- | ------ |
| 029 | [TMDB Client](prds/tmdb-client/README.md)       | Done   |
| 030 | [TheTVDB Client](prds/thetvdb-client/README.md) | Done   |

**App Package & Core UI**

`@pops/app-media` — library browsing, external search with add-to-library, and detail views for movies and TV shows.

| #   | PRD                                                       | Status  |
| --- | --------------------------------------------------------- | ------- |
| 031 | [Library Page](prds/library-page/README.md)               | Done    |
| 032 | [Search Page](prds/search-page/README.md)                 | Done    |
| 033 | [Movie Detail Page](prds/movie-detail-page/README.md)     | Done    |
| 034 | [TV Show Detail Page](prds/tv-show-detail-page/README.md) | Partial |

**Tracking & Watchlist**

Watch history at episode level for TV, plus a prioritised watchlist that auto-removes on manual watches.

| #   | PRD                                           | Status |
| --- | --------------------------------------------- | ------ |
| 035 | [Watch History](prds/watch-history/README.md) | Done   |
| 036 | [Watchlist](prds/watchlist/README.md)         | Done   |

**Ratings & Comparisons**

Pairwise comparison across taste dimensions: pick a winner, ELO scores update, rankings and radar charts visualise the result.

| #   | PRD                                                                               | Status         |
| --- | --------------------------------------------------------------------------------- | -------------- |
| 037 | [Ratings & Comparisons](prds/ratings-comparisons/README.md)                       | Done           |
| 062 | [Comparison Intelligence](prds/comparison-intelligence/README.md)                 | Partial        |
| 064 | [Batch Tier List](prds/batch-tier-list/README.md)                                 | Done           |
| 066 | [Arena Redesign](prds/arena/README.md)                                            | Done           |
| 067 | [Comparison History Enhancements](prds/comparison-history-enhancements/README.md) | Done           |
| —   | [Comparison History — Search & Filter](prds/comparison-history-search/README.md)  | Done           |
| —   | [Post-Watch Debrief](ideas/post-watch-debrief.md)                                 | Idea (unbuilt) |

**Discovery & Recommendations**

The recommendation engine and discover surface — trending, new releases, and personalised suggestions from comparison data, watch history, and genre preferences.

| #   | PRD                                                                     | Status  |
| --- | ----------------------------------------------------------------------- | ------- |
| 038 | [Discovery & Recommendations](prds/discovery-recommendations/README.md) | Partial |
| 060 | [Discover Page](prds/discover-page/README.md)                           | Done    |
| 065 | [Shelf-Based Discovery](prds/shelf-discovery/README.md)                 | Done    |

**Plex Sync**

Polling-based sync with Plex: import library items, watch history, and watchlist. Plex is one input source — POPS owns the library.

| #   | PRD                                                       | Status  |
| --- | --------------------------------------------------------- | ------- |
| 039 | [Plex Sync](prds/plex-sync/README.md)                     | Partial |
| 059 | [Plex Watchlist Sync](prds/plex-watchlist-sync/README.md) | Partial |

**Radarr & Sonarr**

Radarr (movies) and Sonarr (TV) integration — status badges and full request management, replacing Overseerr as the single request interface inside POPS.

| #   | PRD                                                                   | Status  |
| --- | --------------------------------------------------------------------- | ------- |
| 040 | [Arr Status Display](prds/arr-status-display/README.md)               | Partial |
| 041 | [Radarr Request Management](prds/radarr-request-management/README.md) | Done    |
| 042 | [Sonarr Request Management](prds/sonarr-request-management/README.md) | Partial |

**Library Rotation**

Automated movie lifecycle: source-fed candidates, a daily add/remove cycle gated on disk space, and a "leaving soon" grace period. Movies only.

| #   | PRD                                               | Status  |
| --- | ------------------------------------------------- | ------- |
| 070 | [Rotation Engine](prds/rotation-engine/README.md) | Partial |
| 071 | [Source Lists](prds/source-lists/README.md)       | Done    |
| 072 | [Rotation UI](prds/rotation-ui/README.md)         | Partial |

## Key Decisions

| Decision              | Choice                       | Rationale                                                                                       |
| --------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| Schema                | Split tables per media type  | TV hierarchy (show/season/episode) is fundamentally different from movies                       |
| Movie metadata        | TMDB                         | Industry standard, Radarr-aligned                                                               |
| TV metadata           | TheTVDB                      | Plex and Sonarr's native agent                                                                  |
| Rating system         | Pairwise ELO                 | More engaging than stars, richer taste profile                                                  |
| Comparison dimensions | User-configurable            | Stored as data, not code                                                                        |
| Pair selection        | Random (v1)                  | Simple. Smart selection is a future enhancement                                                 |
| Poster storage        | Local cache                  | ~1 GB for a large library, no external dependency at render time                                |
| Plex sync             | Polling                      | Simpler than webhooks, no network config                                                        |
| Radarr/Sonarr         | Status + request management  | Starts read-only, evolves to full request/management (replacing Overseerr)                      |
| Library ownership     | POPS-owned, multi-source     | Library and watch history live in POPS — Plex, manual add, and future sources feed into it      |
| Library rotation      | Automated daily cycle        | Source-fed candidates, weighted random selection, disk-space-gated, 10-day leaving grace period |
| Removal strategy      | Radarr delete + file removal | Space > bandwidth; re-downloading is the feature, not a cost                                    |

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
  </content>
  </invoke>
