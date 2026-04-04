# Epic 05: Discovery & Recommendations

> Theme: [Media](../README.md)

## Scope

Build the recommendation engine and discovery page. Surfaces trending content, new releases, and personalised suggestions based on comparison data, watch history, and genre preferences.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 038 | [Discovery & Recommendations](../prds/038-discovery-recommendations/README.md) | Initial discover page, recommendation algorithm (weighted scoring from genre affinity + comparison scores), trending from TMDB | Partial |
| 060 | [Discover Page](../prds/060-discover-page/README.md) | Full discover page redesign — 9 sections (recommendations, genre spotlight, watchlist-based, trending, rewatch, server, context-aware), Not Interested persistence, Watched action | Partial |
| 065 | [Shelf-Based Discovery](../prds/065-shelf-discovery/README.md) | Dynamic shelf pool system — 27 shelf definitions assembled per session via scoring, freshness, and variety constraints. Netflix-like page variation | Not started |

## Dependencies

- **Requires:** Epic 04 (comparison scores feed recommendations), Epic 03 (watch history for genre affinity)
- **Unlocks:** Epic 07 (recommendations flow into request management — "watch this" → "request this")

## Out of Scope

- Collaborative filtering (requires multi-user data)
- AI-generated shelf titles or descriptions
- Editorial/curated shelves (all algorithmic)
- Streaming availability integration (Netflix/etc. APIs)
