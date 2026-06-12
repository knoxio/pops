# PRD-172: media.plex cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move `media.plex.*` (Plex integration) procedures + related tables into `media.db`. Follows the canonical N-track pattern from [PRD-165](../165-media-movies-cutover/README.md).

The Plex surface holds the Plex server registration, Plex tokens, friends mapping, and the bridge between Plex's library and pops's library.

## Data Model

Tables (move from shared to `packages/media-db`):

- `plex_servers` — { id, server_url, plex_token (encrypted), enabled }
- `plex_friends` — { id, plex_username, mapped_pops_user (if multi-user; today: NULL), shared_libraries_json }
- `plex_sync_state` — last-sync watermarks per surface (libraries, watchlist, ratings)

## API Surface

| Procedure                   | Kind                                               |
| --------------------------- | -------------------------------------------------- |
| `media.plex.servers.list`   | query                                              |
| `media.plex.servers.add`    | mutation                                           |
| `media.plex.servers.remove` | mutation                                           |
| `media.plex.friends.list`   | query                                              |
| `media.plex.friends.sync`   | mutation (calls Plex API)                          |
| `media.plex.libraries.sync` | mutation (calls Plex API)                          |
| `media.plex.watchlist.push` | mutation (calls Plex API; integrates with PRD-167) |

Files today: `apps/pops-api/src/modules/media/plex/{client-discover.ts, client-http.ts, client-mappers.ts, client.ts, friends.ts}`.

## Business Rules

Follows [PRD-165's 4-PR sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- Plex HTTP client is independent of DB; only persistence (servers, friends, sync_state) moves.
- Token encryption is the same as `arr` (PRD-171): centralised on core; encrypted blob is opaque to media-api.

## Edge Cases

| Case                                                | Behaviour                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| Plex token expires mid-sync                         | Existing error handling preserved; status surfaced to user.                     |
| Friend mapping is incomplete (multi-user scenarios) | Single-user assumption; friends listed but not mapped.                          |
| Watchlist push from pops to Plex fails              | Existing retry logic preserved; only the read source (watchlist table) changes. |

## User Stories

| #   | Story                                                       | Summary                                         |
| --- | ----------------------------------------------------------- | ----------------------------------------------- |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — Schemas + services into `@pops/media-db` |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop from shared journal                 |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip router to `getMediaDrizzle()`       |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete or defer shim                     |

## Out of Scope

- Plex token encryption mechanics (stays on core).
- Plex API contract changes (upstream-controlled).
- Multi-user / shared-library expansion.
