# Epic 05: Discovery & Recommendations

> Theme: [Media](../README.md)

## Scope

Build the recommendation engine and discovery page. Surfaces trending content, new releases, and personalised suggestions based on comparison data, watch history, and genre preferences.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 038 | [Discovery & Recommendations](../prds/038-discovery-recommendations/README.md) | Discover page, recommendation algorithm (weighted scoring from genre affinity + comparison scores), trending/new releases from TMDB | Partial |

## Dependencies

- **Requires:** Epic 04 (comparison scores feed recommendations), Epic 03 (watch history for genre affinity)
- **Unlocks:** Epic 07 (recommendations flow into request management — "watch this" → "request this")

## Out of Scope

- Advanced recommendation algorithms (content-based filtering, collaborative filtering — future)
- Mood-based suggestions
- Temporal pattern analysis
