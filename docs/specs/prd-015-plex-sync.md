# PRD-015: Plex Sync

**Epic:** [06 — Plex Sync](../themes/media/epics/06-plex-sync.md)
**Theme:** Media
**Status:** Draft
**ADRs:** [007 — Metadata Sources](../architecture/adr-007-metadata-sources.md)

## Problem Statement

The user has a Plex library with hundreds of movies and TV shows, plus watch history accumulated over years. Manually adding each item to POPS and marking it as watched would be tedious and defeat the "output > input" principle. Plex sync imports the existing library and keeps watch status in sync automatically.

## Goal

A polling-based sync service imports movies and TV shows from Plex, matches them to TMDB/TheTVDB, adds them to the POPS library, and syncs watch history at the episode level. After initial import, periodic syncs pick up new additions and watch events.

## Requirements

### R1: Plex API Client

Create `apps/pops-api/src/modules/media/plex/`:

```
media/plex/
  client.ts           (HTTP client for Plex API)
  types.ts            (Plex API response types)
  matcher.ts          (match Plex items to TMDB/TheTVDB IDs)
  sync-service.ts     (orchestration — import, sync, scheduling)
  sync-service.test.ts
  client.test.ts
  matcher.test.ts
```

**Plex API basics:**
- Base URL: user-configured (e.g., `http://192.168.1.100:32400`)
- Authentication: `X-Plex-Token` header
- Content type: `Accept: application/json`

**Key endpoints:**
- `GET /library/sections` — list libraries (movie, TV)
- `GET /library/sections/{id}/all` — all items in a library
- `GET /library/metadata/{id}` — item detail (includes watch status)
- `GET /library/metadata/{id}/children` — seasons for a show
- `GET /library/metadata/{id}/allLeaves` — all episodes for a show

### R2: Plex Connection Configuration

**Environment variables (v1):**
- `PLEX_URL` — Plex server base URL (e.g., `http://192.168.1.100:32400`)
- `PLEX_TOKEN` — Plex authentication token
- Document both in `.env.example`

**tRPC procedures for connection management:**

| Procedure | Type | Description |
|-----------|------|-------------|
| `media.plex.testConnection` | query | Verify Plex server is reachable and token is valid |
| `media.plex.getLibraries` | query | List available Plex libraries (movie + TV) |
| `media.plex.getConfig` | query | Return current sync config (URL set, libraries selected, last sync time) |
| `media.plex.updateConfig` | mutation | Set which libraries to sync |

**Connection test:** Call `GET /` on the Plex server with the token. If it returns server info, the connection is valid. Return server name and version for display.

### R3: TMDB/TheTVDB Matching

Plex items need to be matched to TMDB (movies) or TheTVDB (TV) IDs for insertion into the POPS library.

**Matching strategy (ordered by reliability):**

1. **Plex agent ID** — Plex stores the metadata agent source. For items matched by the TMDB agent, the Plex metadata includes `guid` with format `plex://movie/{tmdb_id}` or external IDs. For TV, Plex often uses TheTVDB agent: `com.plexapp.agents.thetvdb://{tvdb_id}`. Extract the ID directly.
2. **External IDs** — Plex's `GET /library/metadata/{id}` may include IMDB, TMDB, or TVDB IDs in the `Guid` array (format: `imdb://tt1234567`, `tmdb://12345`, `tvdb://67890`).
3. **Title + year search** — Fall back to searching TMDB/TheTVDB by title and year. Pick the top result if confidence is high (exact title match + same year).

**Matching result:**
```typescript
interface MatchResult {
  plexId: string;
  title: string;
  year: number;
  externalId: number | null;     // TMDB ID for movies, TheTVDB ID for TV
  matchMethod: 'agent_id' | 'external_id' | 'search' | 'unmatched';
  confidence: 'high' | 'low' | 'none';
}
```

**Unmatched items:** Log them for manual review. Don't silently skip — the user should know what wasn't imported.

### R4: Initial Library Import

**tRPC procedure:** `media.plex.startSync`

| Input | Type | Description |
|-------|------|-------------|
| `libraryIds` | `number[]` | Plex library section IDs to sync |
| `importWatchHistory` | `boolean` (default true) | Also sync watch status |

**Steps for movie libraries:**
1. Fetch all items from the Plex movie library
2. For each item, attempt TMDB matching (R3)
3. For matched items not already in POPS: call `media.library.addMovie` (PRD-008)
4. For matched items already in POPS: link Plex ID to existing record (store plex metadata ID for future syncs)
5. If `importWatchHistory`: check Plex watch status, create `watch_history` entries

**Steps for TV libraries:**
1. Fetch all shows from the Plex TV library
2. For each show, attempt TheTVDB matching (R3)
3. For matched shows not already in POPS: call `media.library.addTvShow` (PRD-009)
4. If `importWatchHistory`: fetch episode-level watch status from Plex, create `watch_history` entries per episode

**Rate limiting:** TMDB/TheTVDB API calls go through the existing rate limiters (PRD-008, PRD-009). A 2,500-movie Plex library takes ~10 minutes for the TMDB lookups at 40 req/10s.

**Progress tracking:** The sync is a long-running operation. Track progress and expose it via a tRPC query:

```typescript
interface SyncProgress {
  status: 'idle' | 'running' | 'completed' | 'error';
  totalItems: number;
  processedItems: number;
  matchedItems: number;
  unmatchedItems: number;
  errors: string[];
  startedAt: string;
  completedAt: string | null;
}
```

### R5: Periodic Watch History Sync

After initial import, poll Plex for watch status changes.

**Scheduler:**
- Configurable interval: environment variable `PLEX_SYNC_INTERVAL_HOURS` (default: 6)
- Runs as a `setInterval` in the Node process (not a separate cron job)
- Can be triggered manually via `media.plex.syncNow` tRPC mutation

**Sync logic:**
1. For each library item in POPS that has a Plex link:
   - Fetch current watch status from Plex
   - If Plex says watched and POPS doesn't have a watch event → create one (use Plex's `lastViewedAt` timestamp)
   - If POPS says watched and Plex doesn't → no action (POPS is source of truth for manual watches)
2. For new items in Plex not yet in POPS → add them via the metadata integration

**Sync log table:**

```typescript
export const plexSyncLog = sqliteTable('plex_sync_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  status: text('status', { enum: ['running', 'completed', 'error'] }).notNull(),
  moviesAdded: integer('movies_added').notNull().default(0),
  showsAdded: integer('shows_added').notNull().default(0),
  watchEventsAdded: integer('watch_events_added').notNull().default(0),
  errors: text('errors', { mode: 'json' }).$type<string[]>().default([]),
  startedAt: text('started_at').notNull().default(sql`(datetime('now'))`),
  completedAt: text('completed_at'),
});
```

### R6: Plex Sync UI

Minimal UI for managing the Plex connection and viewing sync status.

**Location:** Settings section within the media app (or a dedicated `/media/settings` page)

**Layout:**
- Connection status: "Connected to [Server Name]" or "Not connected"
- Connection test button
- Library selection: checkboxes for which Plex libraries to sync
- Last sync time and summary (added X movies, Y shows, Z watch events)
- "Sync Now" button with progress indicator
- Sync history: last 5 sync runs with status and counts
- Unmatched items list (items from Plex that couldn't be matched to TMDB/TheTVDB)

### R7: Plex Link Storage

Store the Plex-to-POPS mapping for efficient sync:

```typescript
export const plexLinks = sqliteTable('plex_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  plexId: text('plex_id').unique().notNull(),
  mediaType: text('media_type', { enum: ['movie', 'tv_show'] }).notNull(),
  mediaId: integer('media_id').notNull(),
  plexLibraryId: integer('plex_library_id').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_plex_links_media').on(table.mediaType, table.mediaId),
]);
```

This table enables efficient sync: query Plex for changes, look up the local ID via `plex_links`, update watch status.

## Out of Scope

- Plex webhooks (future enhancement — polling first)
- Writing back to Plex (POPS reads only)
- Syncing Plex ratings
- Plex playlist sync
- Syncing non-movie/TV content (music, photos)
- Multi-user Plex (syncs the primary user's watch status only)

## Acceptance Criteria

1. Plex client connects using URL and token from environment variables
2. Connection test returns server name and version
3. Library discovery lists available movie and TV libraries
4. TMDB matching works via agent ID, external ID, and title+year fallback
5. TheTVDB matching works via agent ID, external ID, and title+year fallback
6. Initial import adds movies and shows to the POPS library
7. Watch history import creates watch events with Plex's `lastViewedAt` timestamps
8. Periodic sync picks up new additions and watch status changes
9. Manual "sync now" triggers an immediate sync
10. Sync progress is queryable during a running sync
11. Sync log records results of each sync run
12. Unmatched items are logged and displayable
13. Duplicate detection prevents re-importing existing library items (match on TMDB/TheTVDB ID)
14. Plex link table enables efficient lookup during sync
15. `.env.example` updated with `PLEX_URL`, `PLEX_TOKEN`, `PLEX_SYNC_INTERVAL_HOURS`
16. Unit tests for: Plex client, matching logic, sync service
17. `mise db:seed` updated with Plex sync state
18. `pnpm typecheck` and `pnpm test` pass

## User Stories

> **Standard verification — applies to every US below.**
>
> **Sizing:** Each story is scoped for one agent, ~15-20 minutes.

### Batch A — Infrastructure (parallelisable)

#### US-1: Plex HTTP client
**Scope:** Create `modules/media/plex/client.ts`. Auth via `X-Plex-Token` header. Implement: `getLibraries()`, `getLibraryItems(sectionId)`, `getItemDetail(metadataId)`, `getEpisodes(showId)`. Connection test (call `GET /` → return server name/version). Typed responses, typed errors. Unit tests with mocked Plex responses.
**Files:** `modules/media/plex/client.ts`, `types.ts`, `client.test.ts`

#### US-2: Metadata matching logic
**Scope:** Create `modules/media/plex/matcher.ts`. Three strategies in order: (1) extract TMDB/TheTVDB ID from Plex GUID format, (2) extract from Plex external IDs array, (3) title+year search fallback via TMDB/TheTVDB clients. Returns `MatchResult` with `externalId`, `matchMethod`, `confidence`. Logs unmatched items. Unit tests for each strategy.
**Files:** `modules/media/plex/matcher.ts`, `matcher.test.ts`

#### US-schema: Plex link and sync log schemas
**Scope:** Create `src/db/schema/plex.ts` with `plexLinks` and `plexSyncLog` Drizzle schemas per R7 and R5. Run `drizzle-kit generate`. Add tRPC query for sync log retrieval and connection config.
**Files:** `src/db/schema/plex.ts`, `modules/media/plex/router.ts`

### Batch B — Sync logic (depends on Batch A)

#### US-3a: Initial movie import
**Scope:** In `modules/media/plex/sync-service.ts`, implement movie library import: fetch all items from Plex movie library → match to TMDB → for matched items not in POPS, call `addMovie` → if `importWatchHistory`, check Plex watch status and create `watch_history` entries with Plex timestamps → create `plexLinks` rows. Skip duplicates (match on TMDB ID). Track progress. Integration test with mocked Plex + TMDB responses.
**Files:** `modules/media/plex/sync-service.ts`, test

#### US-3b: Initial TV import
**Scope:** Same flow for TV: fetch Plex TV library → match to TheTVDB → call `addTvShow` → sync episode-level watch status → create `plexLinks`. Integration test.
**Files:** `modules/media/plex/sync-service.ts` (extend)

#### US-4: Periodic sync scheduler
**Scope:** Add polling scheduler: `setInterval` at configurable interval (`PLEX_SYNC_INTERVAL_HOURS`, default 6). Manual trigger via `media.plex.syncNow` tRPC mutation. On each sync: check for new Plex items, check for new watch events, write sync log entry. `.env.example` updated.
**Files:** `modules/media/plex/sync-service.ts` (scheduler), `router.ts` (syncNow procedure)

### Batch C — UI (depends on Batch B)

#### US-5: Plex sync status UI
**Scope:** Create Plex settings section (in media settings page or standalone). Connection status ("Connected to [Server Name]" or "Not connected"). Connection test button. Library selection (checkboxes). Last sync time + summary. "Sync Now" button with progress indicator. Sync history (last 5 runs). Unmatched items list.
**Files:** Media settings page/section
