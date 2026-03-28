# Epic 00: Data Model & API

> Theme: [Media](../README.md)

## Scope

Define the media domain schema (movies, TV shows, seasons, episodes, comparisons, scores, watchlist, watch history) and build the base tRPC routers. This is the data foundation that all other media epics build on.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 028 | [Media Data Model & API](../prds/028-media-data-model-api/README.md) | Split tables per ADR-008, comparison dimensions, media scores, tRPC routers for all media entities | Done |

## Dependencies

- **Requires:** Foundation (API server, DB schema patterns)
- **Unlocks:** Every other media epic

## Out of Scope

- External API integrations (Epic 01)
- UI pages (Epic 02)
- Business logic beyond basic CRUD (comparisons, recommendations — later epics)
