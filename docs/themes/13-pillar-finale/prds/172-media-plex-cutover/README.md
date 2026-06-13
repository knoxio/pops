# PRD-172: media.plex cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)
>
> **Status:** Done (documentation-only). No N-track sequence applies — see [Decision](#decision).

## Overview

The Plex integration has no tables to move. Every piece of state it owns lives in `core.settings` (encrypted token, server URL, Plex.tv username, client identifier, encryption seed, library section IDs, scheduler keys), and every table it orchestrates against — `movies`, `tv_shows`, `seasons`, `episodes`, `media_watchlist`, `watch_history` — is owned by a different slice. The Plex auth, scheduler, encryption, and HTTP-client surfaces stay on pops-api per the Theme 13 framework for orchestration code.

This PRD records the finding so future agents do not scaffold a `packages/media-db/src/services/plex.ts` that has nothing to host.

## Data Model

None. The codebase has no `plex_servers`, `plex_friends`, or `plex_sync_state` tables. Earlier theme planning assumed a multi-server / multi-user model that was never implemented; pops runs against one Plex server with state pinned in `core.settings`. Friends are fetched live from Plex.tv's GraphQL API; there is no friends table to migrate.

If a future requirement introduces a Plex-only table (multi-server registry, per-friend mapping, per-source watermarks), open a new PRD at that point. As of today there is nothing to migrate.

## API Surface

| Procedure group                | Location today                           | Decision                                                      |
| ------------------------------ | ---------------------------------------- | ------------------------------------------------------------- |
| Auth (PIN OAuth, disconnect)   | pops-api `plex/router-auth.ts`           | Stays. Writes encrypted token to `core.settings` (PRD-183).   |
| Connection (URL, libraries)    | pops-api `plex/router-connection.ts`     | Stays. Writes URL to `core.settings`.                         |
| Sync (enqueue, poll, list)     | pops-api `plex/router-sync.ts`           | Stays. Reads `sync_job_results` — worker-orchestration table. |
| Scheduler                      | pops-api `plex/router-scheduler.ts`      | Stays. Persists schedule + last-run in `core.settings`.       |
| HTTP clients + friends GraphQL | pops-api `plex/{client*.ts, friends.ts}` | Stays. DB-free.                                               |

## Decision

**No N-track sequence for `media.plex.*`.**

The 4-PR canonical pattern (scaffold → journal split → cutover → shim delete) does not apply: there is no schema to scaffold, no journal entry to split, no router whose handle to flip, no shim to delete. The orchestration writes that Plex sync produces (movies, tv_shows, watchlist, watch_history) are owned by their respective slices' PRDs:

- Movies writes → PRD-165 PR3 (done in #3018)
- TV shows writes → PRD-166 PR3 (done in #3019)
- Watchlist writes → PRD-167 PR3 (done in #3020)
- Watch-history writes → PRD-168 PR3 (done in #3026)

The Plex auth/encryption/scheduler stay on pops-api because they orchestrate against `core.settings` (encryption seed, token, scheduler config) and the BullMQ worker queue. Moving them into `apps/pops-media-api` would split the encryption surface across pillars, which contradicts the centralised-key-management direction in [PRD-171](../171-media-arr-cutover/README.md).

## Edge Cases

| Case                                                | Behaviour                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| Plex token expires mid-sync                         | Handled in `client.ts` / `router-auth.ts`; unchanged.                           |
| Friend mapping is incomplete (multi-user scenarios) | Single-user assumption preserved; friends fetched live from Plex.tv GraphQL.    |
| Watchlist push from pops to Plex fails              | Handled by `sync-watchlist.ts`; unchanged. Writes go to `media.db` per PRD-167. |
| `core.settings` cutover lands (PRD-183)             | `service.ts` lookups follow whatever handle the settings service points at.     |

## Follow-ups (not in this PRD)

Audit items surfaced by this investigation, owned elsewhere:

1. **Dead transaction wrappers** in `plex/sync-movies.ts`, `plex/sync-tv.ts`, `plex/sync-watch-history.ts`, `plex/sync-watchlist-resolve.ts`. Several `getDb().transaction(() => …)` calls wrap operations whose underlying writes now land in `media.db` via `getMediaDrizzle()`. The shared-DB transaction provides no atomicity for those calls. Idempotency of the wrapped operations (`createMovie` throws on conflict; `logMovieWatch` short-circuits on near-duplicates) means this is a latent gap rather than a today-bug. Collapse to the correct single handle when [PRD-168 PR4](../168-media-watch-history-cutover/) retires `logWatch`'s shared handle.
2. **`sync_job_results` reads** in `router-sync.ts`. Worker-orchestration table; relocation decided by Epic 08b (orchestrator placement) or PRD-186 (core.aiUsage pattern).
3. **`tv_shows` + `seasons`/`episodes` co-mutation** in `library/tv-show-service.ts`. Owned by PRD-166 / PRD-169, not by this PRD.

## Out of Scope

- Moving any router file into `apps/pops-media-api`.
- Creating `packages/media-db/src/services/plex.ts`.
- Touching encryption mechanics in `service.ts`.
- The `sync_job_results` table — separate slice.

## User Stories

None. This PRD is documentation-only.
