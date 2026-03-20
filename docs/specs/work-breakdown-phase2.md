# Phase 2 Work Breakdown — Agent-Sized Tasks

Each task is scoped for **one agent, 15-20 minutes, one concern**. Tasks within the same batch are parallelisable. Dependencies are between batches, not within them.

**Naming:** `{PRD}-{US}.{sub}` — e.g., `007-1` is PRD-007 US-1, `007-7a` is the first sub-task of PRD-007 US-7.

---

## PRD-007: Media Data Model & API Module

**Batch A — Schema (parallelisable):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 007-1a | Drizzle schema: `movies` table | `src/db/schema/movies.ts` |
| 007-1b | Drizzle schema: `tv_shows`, `seasons`, `episodes` tables | `src/db/schema/tv-shows.ts` |
| 007-1c | Drizzle schema: `watchlist` table | `src/db/schema/watchlist.ts` |
| 007-1d | Drizzle schema: `watch_history` table | `src/db/schema/watch-history.ts` |
| 007-1e | Drizzle schema: `comparison_dimensions`, `comparisons`, `media_scores` tables | `src/db/schema/comparisons.ts` |

**Batch B — Types + migration (depends on Batch A):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 007-1f | Re-export schemas from `schema/index.ts`, run `drizzle-kit generate` | `src/db/schema/index.ts`, migrations/ |
| 007-2 | Export Drizzle-inferred types from `@pops/db-types` | `packages/db-types/src/media.ts`, `index.ts` |

**Batch C — Routers (parallelisable, depends on Batch B):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 007-3 | Movies tRPC router + service + types + tests (6 procedures) | `modules/media/movies/*` |
| 007-4a | TV shows tRPC router — basic CRUD (getById, getByTvdbId, list, create, update, delete) + tests | `modules/media/tv-shows/router.ts`, `service.ts`, `types.ts`, `test` |
| 007-4b | TV shows — `createWithSeasons` transactional insert + `getSeason` query + tests | `modules/media/tv-shows/service.ts`, `test` |
| 007-5 | Watchlist tRPC router + service + types + tests (5 procedures) | `modules/media/watchlist/*` |
| 007-6a | Watch history — basic CRUD: `log`, `remove`, `listByMedia`, `listRecent` + tests | `modules/media/watch-history/*` |
| 007-6b | Watch history — `batchLog` + `getProgress` (next episode calculation) + tests | `modules/media/watch-history/service.ts`, `test` |
| 007-7a | ELO calculation pure function + unit tests | `modules/media/comparisons/elo.ts`, `elo.test.ts` |
| 007-7b | Comparison dimensions CRUD router + tests | `modules/media/comparisons/router.ts` (dimension procedures only) |
| 007-7c | Comparison submit + score update (uses elo.ts) + tests | `modules/media/comparisons/router.ts` (submit procedure), `service.ts` |
| 007-7d | Random pair selection + rankings query + tests | `modules/media/comparisons/router.ts` (getRandomPair, getRankings) |

**Batch D — Integration (depends on Batch C):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 007-9 | Register media router in top-level app router | `src/router.ts`, `modules/media/index.ts` |
| 007-8 | Seed media test data (10 movies, 3 TV shows, 5 dimensions) | `src/db/seeder.ts` |

---

## PRD-008: TMDB Client (Movies)

**Batch A — Infrastructure (parallelisable):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 008-1 | TMDB HTTP client — auth, searchMovies, getMovie, getMovieImages, getGenreList + tests | `modules/media/tmdb/client.ts`, `types.ts`, `client.test.ts` |
| 008-2 | Token bucket rate limiter (shared class) + tests | `modules/media/tmdb/rate-limiter.ts`, `rate-limiter.test.ts` |
| 008-7 | Genre ID-to-name mapping cache | `modules/media/tmdb/client.ts` (genre cache logic) |

**Batch B — Image system (parallelisable, depends on Batch A):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 008-3 | Image cache service — download, store, delete movie images + tests | `modules/media/tmdb/image-cache.ts`, test |
| 008-4 | Image serving Express endpoint — resolution chain, placeholder generation, cache headers | `src/routes/media-images.ts` or `app.ts` |

**Batch C — Orchestration (depends on A + B):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 008-5 | Add movie to library flow — TMDB fetch → map → insert → download images + integration test | `modules/media/tmdb/service.ts`, `service.test.ts` |
| 008-6 | Metadata refresh flow — re-fetch, update record, optionally re-download images | `modules/media/tmdb/service.ts` |

---

## PRD-009: TheTVDB Client (TV Shows)

**Batch A — Infrastructure (parallelisable):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 009-1a | TheTVDB HTTP client — login, token management, auth module + tests | `modules/media/thetvdb/auth.ts`, `auth.test.ts` |
| 009-1b | TheTVDB HTTP client — searchSeries, getSeriesExtended, getSeriesEpisodes + tests | `modules/media/thetvdb/client.ts`, `types.ts`, `client.test.ts` |
| 009-2 | TheTVDB rate limiter instance (reuses TokenBucketRateLimiter from 008) | `modules/media/thetvdb/client.ts` (instantiation) |
| 009-6 | Response mapping functions — search results, show detail, episodes, artworks + tests | `modules/media/thetvdb/types.ts`, test |

**Batch B — Image system (depends on Batch A):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 009-3 | TV image cache — download show poster/backdrop, artwork selection, extend image cache service | `modules/media/tmdb/image-cache.ts` (add TV methods) |

**Batch C — Orchestration (depends on A + B):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 009-4 | Add TV show to library — TheTVDB fetch → map → insert show + seasons + episodes in transaction + integration test | `modules/media/thetvdb/service.ts`, test |
| 009-5 | TV metadata refresh — re-fetch, update, insert new episodes without deleting existing | `modules/media/thetvdb/service.ts` |

---

## PRD-010: App Package & Core UI

**Batch A — Scaffold (sequential, small):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 010-1 | Create `@pops/app-media` package scaffold (package.json, tsconfig, routes.tsx, index.ts) | `packages/app-media/*` |
| 010-2 | Register media in shell app switcher (icon, label, lazy route import) | `apps/pops-shell/` (app switcher config, router) |

**Batch B — Components (parallelisable, depends on Batch A):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 010-4a | `MediaCard` component + Storybook story | `packages/app-media/src/components/MediaCard.*` |
| 010-4b | `MediaGrid` component (responsive grid layout) + story | `packages/app-media/src/components/MediaGrid.*` |
| 010-4c | `MediaDetail` component (hero section, metadata layout) + story | `packages/app-media/src/components/MediaDetail.*` |
| 010-4d | `EpisodeList` component + story | `packages/app-media/src/components/EpisodeList.*` |
| 010-4e | `SearchResults` component + story | `packages/app-media/src/components/SearchResults.*` |
| 010-4f | `GenreTags` + `MediaTypeBadge` components + stories | `packages/app-media/src/components/GenreTags.*`, `MediaTypeBadge.*` |

**Batch C — Pages (parallelisable, depends on Batch B):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 010-3 | Library page — grid view, filters, sort, empty state | `packages/app-media/src/pages/LibraryPage.tsx`, hooks |
| 010-5 | Movie detail page — hero, metadata, genre tags | `packages/app-media/src/pages/MovieDetailPage.tsx` |
| 010-6 | TV show detail page — hero, season list | `packages/app-media/src/pages/TvShowDetailPage.tsx` |
| 010-7 | Season detail page — episode list, breadcrumbs | `packages/app-media/src/pages/SeasonDetailPage.tsx` |
| 010-8 | Search page — debounced input, TMDB/TheTVDB results, add-to-library | `packages/app-media/src/pages/SearchPage.tsx` |

---

## PRD-011: Watchlist Management

**Batch A (parallelisable):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 011-1 | Watchlist page — ordered list, poster, notes, remove action | `packages/app-media/src/pages/WatchlistPage.tsx` |
| 011-2 | Add/remove watchlist toggle on detail pages + library cards | `MediaDetail.tsx`, `MediaCard.tsx` (add watchlist button) |
| 011-3 | Watchlist reorder — drag or up/down, priority update | `WatchlistPage.tsx` (reorder logic) |
| 011-4 | Watchlist notes — inline add/edit | `WatchlistPage.tsx` (notes UI) |
| 011-5 | Auto-remove on watch — hook into watch history service | `modules/media/watch-history/service.ts` (watchlist cleanup) |

---

## PRD-012: Watch History & Tracking

**Batch A (parallelisable):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 012-1 | Movie watch toggle on detail page — mark watched/unwatched/rewatch | `MovieDetailPage.tsx` |
| 012-2 | Episode watch toggles on season detail page | `SeasonDetailPage.tsx`, `EpisodeList.tsx` |
| 012-3 | Batch watch operations — mark season/show as watched/unwatched | `TvShowDetailPage.tsx`, `SeasonDetailPage.tsx` |
| 012-4 | TV show progress indicators — progress bars on detail + cards | `TvShowDetailPage.tsx`, `MediaCard.tsx` |
| 012-5 | Watch history page — chronological log, filters, pagination | `packages/app-media/src/pages/HistoryPage.tsx` |
| 012-6 | Custom watch date — date picker on mark-as-watched | `MovieDetailPage.tsx` (date override) |

---

## PRD-013: Ratings & Comparisons

**Batch A — Core (parallelisable):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 013-1a | Comparison arena page — card layout, tap-to-select, animation, skip | `packages/app-media/src/pages/CompareArenaPage.tsx` |
| 013-1b | Auto-load next pair + session counter | `CompareArenaPage.tsx` (flow logic) |
| 013-2 | Dimension management UI — add/edit/deactivate/reorder | Settings section or modal component |
| 013-3 | Rankings page — dimension tabs, ranked list, composite score | `packages/app-media/src/pages/RankingsPage.tsx` |
| 013-4 | Radar chart score visualisation on movie detail page | `MovieDetailPage.tsx`, new chart component |

---

## PRD-014: Discovery & Recommendations

**Batch A — Backend (parallelisable):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 014-1 | Preference profile computation — genre affinity, dimension weights + tests | `modules/media/recommendations/profile.ts`, test |
| 014-2a | Candidate sourcing — fetch TMDB similar/popular/trending/top-rated, cache locally | `modules/media/recommendations/candidates.ts` |
| 014-2b | Scoring algorithm — weighted scoring, filter watched/dismissed + tests | `modules/media/recommendations/scoring.ts`, test |
| 014-5 | Dismissed suggestions — schema, tRPC CRUD, filter from candidates | `src/db/schema/dismissed.ts`, `modules/media/recommendations/router.ts` |

**Batch B — Frontend (parallelisable, depends on Batch A):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 014-3a | Discovery page — "Recommended for You" section | `packages/app-media/src/pages/DiscoverPage.tsx` |
| 014-3b | Discovery page — "Trending" + "Because You Liked [X]" sections | `DiscoverPage.tsx` |
| 014-4 | "What should I watch tonight?" quick-pick flow | New component/modal |

---

## PRD-015: Plex Sync

**Batch A — Infrastructure (parallelisable):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 015-1 | Plex HTTP client — auth, library list, item detail, episodes + tests | `modules/media/plex/client.ts`, test |
| 015-2 | Metadata matching — agent ID extraction, external IDs, title+year fallback + tests | `modules/media/plex/matcher.ts`, test |
| 015-schema | Plex link + sync log Drizzle schemas | `src/db/schema/plex.ts` |

**Batch B — Sync logic (depends on Batch A):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 015-3a | Initial movie import — match + add via addMovie + watch history | `modules/media/plex/sync-service.ts` |
| 015-3b | Initial TV import — match + add via addTvShow + episode watch history | `modules/media/plex/sync-service.ts` |
| 015-4 | Periodic sync scheduler — setInterval, manual trigger, sync log | `modules/media/plex/sync-service.ts` |

**Batch C — UI (depends on Batch B):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 015-5 | Plex sync status UI — connection status, sync history, "Sync Now", unmatched items | Media settings page/section |

---

## PRD-016: Radarr & Sonarr

**Batch A — Clients (parallelisable):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 016-1a | Shared *arr base HTTP client — auth, request construction, error handling + tests | `modules/media/arr/base-client.ts`, test |
| 016-1b | Radarr client — monitored movies, queue, status mapping + tests | `modules/media/arr/radarr-client.ts`, test |
| 016-1c | Sonarr client — monitored series, queue, status mapping + tests | `modules/media/arr/sonarr-client.ts`, test |

**Batch B — UI (parallelisable, depends on Batch A):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 016-2 | Radarr status badge on movie detail page | `MovieDetailPage.tsx` |
| 016-3 | Sonarr status badge on TV show detail page | `TvShowDetailPage.tsx` |
| 016-4 | Download queue widget — combined Radarr + Sonarr | New component |
| 016-5 | Graceful degradation — hide when not configured, handle unreachable | Service layer + UI guards |

---

## PRD-017: Inventory Schema Upgrade

**Batch A — Schema (parallelisable):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 017-1a | Drizzle schema: `locations` table (self-referential tree) | `src/db/schema/locations.ts` |
| 017-1b | Drizzle schema: `inventory_items` table (upgraded from home_inventory) | `src/db/schema/inventory-items.ts` |
| 017-1c | Drizzle schema: `item_connections` junction table | `src/db/schema/item-connections.ts` |
| 017-1d | Drizzle schema: `item_photos` table | `src/db/schema/item-photos.ts` |

**Batch B — Migration + types (depends on Batch A):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 017-1e | Re-export schemas, generate migrations, run on fresh + existing DBs | `src/db/schema/index.ts`, migrations/ |
| 017-2 | Data migration script — existing home_inventory → new schema, create location tree from room/location values | Custom migration script |

**Batch C — Routers (parallelisable, depends on Batch B):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 017-3a | Locations router — getTree, create, update, delete + tests | `modules/inventory/locations/router.ts`, service, test |
| 017-3b | Locations router — getItems (with children option), getPath (breadcrumb) + tests | `modules/inventory/locations/service.ts`, test |
| 017-4 | Connections router — connect, disconnect, listForItem, traceChain + tests | `modules/inventory/connections/*` |
| 017-5 | Photos router — upload (with compression), delete, reorder + image serving endpoint + tests | `modules/inventory/photos/*` |
| 017-6 | Updated items router — add asset_id, location_id, notes, searchByAssetId + tests | `modules/inventory/items/*` |

**Batch D — Seed (depends on Batch C):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 017-7 | Seed data — location tree, 15+ items, 10+ connections, sample photos | `src/db/seeder.ts` |

---

## PRD-018: Notion Inventory Import

**Batch A (parallelisable):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 018-1 | Notion data fetch — paginated fetch of all items + page content | Import script |
| 018-2 | Property mapping — Notion properties → POPS fields, enum/boolean/date conversion | Import script |
| 018-3 | Location tree auto-creation from Room + Location values | Import script |
| 018-4 | "Used By" preservation — append to notes as markdown | Import script |
| 018-5 | Photo download — extract image URLs, download, compress, store | Import script |

**Batch B (depends on Batch A):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 018-6 | Dry-run mode — report generation without writes | Import script |
| 018-7 | Mise task: `mise import:notion-inventory` with --execute flag | `mise.toml` |

---

## PRD-019: Inventory App Package & Item UI

**Batch A — Scaffold:**

| Task | Scope | Files touched |
|------|-------|---------------|
| 019-1 | Create `@pops/app-inventory` package scaffold + shell integration | `packages/app-inventory/*`, shell config |

**Batch B — Components (parallelisable, depends on Batch A):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 019-c1 | `InventoryCard` component + story | Component file |
| 019-c2 | `InventoryTable` component (enhanced data table) + story | Component file |
| 019-c3 | `PhotoGallery` + `PhotoUpload` components + stories | Component files |
| 019-c4 | `LocationPicker` tree selector component + story | Component file |
| 019-c5 | `LocationBreadcrumb` + `AssetIdBadge` + `ConditionBadge` + `TypeBadge` components + stories | Component files |
| 019-c6 | `ConnectionsList` component + story | Component file |

**Batch C — Pages (parallelisable, depends on Batch B):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 019-2 | Item list page — table/grid toggle, search, filters, sort, value summary | `ItemListPage.tsx` |
| 019-3 | Item detail page — metadata, photos, connections, notes, warranty status | `ItemDetailPage.tsx` |
| 019-4 | Item create/edit form — all fields, location picker, asset ID validation | `ItemFormPage.tsx` |
| 019-7 | Asset ID search — exact match, case-insensitive, direct navigation | Search logic in list page |

---

## PRD-020: Location Tree Management

**Batch A (parallelisable):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 020-1 | Location tree page — hierarchical display, expand/collapse, item counts | `LocationTreePage.tsx` |
| 020-2 | Add location — root and child, inline text input | `LocationTreePage.tsx` |
| 020-3 | Rename + reorder — inline rename, drag within level | `LocationTreePage.tsx` |
| 020-4 | Move location — drag reparent + "Move to..." dialog, circular ref prevention | `LocationTreePage.tsx` |
| 020-5 | Delete location — confirmation dialogs, orphan handling | `LocationTreePage.tsx` |
| 020-6 | Location contents panel — items at selected location, include sub-locations toggle | Side panel component |

---

## PRD-021: Connections & Graph

**Batch A (parallelisable):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 021-1a | ConnectDialog component — search/autocomplete to find items | Component |
| 021-1b | Connect/disconnect actions on detail page | `ItemDetailPage.tsx` |
| 021-2 | Connections list on detail page — direct connections with metadata | `ConnectionsList.tsx` enhancement |
| 021-3 | Connection chain tracing — expandable tree view, recursive traversal | `ConnectionChain` component |
| 021-4 | Connect during item creation — "Connected to" section on form | `ItemFormPage.tsx` |

---

## PRD-022: Paperless-ngx Integration

**Batch A — Backend (parallelisable):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 022-1a | Paperless-ngx HTTP client — auth, search, metadata fetch + tests | `modules/inventory/paperless/client.ts`, test |
| 022-1b | Paperless-ngx thumbnail proxy | `modules/inventory/paperless/client.ts` |
| 022-schema | `item_documents` Drizzle schema + tRPC router (link/unlink/list) + tests | Schema, router, service, test |

**Batch B — UI (depends on Batch A):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 022-2 | "Link Document" modal — search Paperless-ngx, select type, link | Component |
| 022-3 | Linked documents display on detail page — grouped by type, thumbnails, unlink | `ItemDetailPage.tsx` |
| 022-4 | Graceful degradation — hide when not configured, show unavailable when down | UI guards |

---

## PRD-023: Warranty, Value & Reporting

**Batch A — Backend (parallelisable):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 023-api-1 | Dashboard stats endpoint — total value, item count, expiring warranties | `modules/inventory/reports/router.ts` |
| 023-api-2 | Value breakdown endpoints — by room, by type | `modules/inventory/reports/router.ts` |
| 023-api-3 | Insurance report endpoint — items by location subtree with all metadata | `modules/inventory/reports/router.ts` |

**Batch B — UI (parallelisable, depends on Batch A):**

| Task | Scope | Files touched |
|------|-------|---------------|
| 023-1 | Dashboard widgets — total value, item count, expiring warranties, recent items | `ItemListPage.tsx` (dashboard section) |
| 023-2 | Value breakdown charts — by room, by type | Chart components |
| 023-3 | Warranty tracking page — expiring soon, expired, active groups | `WarrantiesPage.tsx` |
| 023-4 | Insurance report page — location selector, item list with photos, printable CSS | `ReportPage.tsx` |
| 023-5 | Filtered value display — total replacement/resale for any filtered list | `ItemListPage.tsx` (aggregation) |

---

## Summary

| PRD | Original USs | Split tasks | Max parallel |
|-----|-------------|-------------|-------------|
| 007 | 9 | 20 | 10 (Batch C) |
| 008 | 7 | 9 | 3 |
| 009 | 6 | 9 | 4 |
| 010 | 8 | 13 | 6 |
| 011 | 5 | 5 | 5 |
| 012 | 6 | 6 | 6 |
| 013 | 4 | 5 | 4 |
| 014 | 5 | 8 | 4 |
| 015 | 5 | 8 | 3 |
| 016 | 5 | 7 | 3 |
| 017 | 7 | 13 | 5 |
| 018 | 6 | 7 | 5 |
| 019 | 7 | 13 | 6 |
| 020 | 6 | 6 | 6 |
| 021 | 5 | 5 | 5 |
| 022 | 4 | 6 | 3 |
| 023 | 5 | 8 | 4 |
| **Total** | **102** | **148** | — |
