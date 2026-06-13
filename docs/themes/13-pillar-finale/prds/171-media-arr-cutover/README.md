# PRD-171: media.arr cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

`media/arr/` is the bridge between pops and the Radarr/Sonarr download stack: read URL + API key, talk to the `*arr` HTTP APIs, queue/search/calendar, mark a movie as "protected" so it survives rotation. It has **no tables of its own**.

Investigation against the live code shows the persistence touch points are already where they belong:

| Persistence touchpoint                                   | Lives on                                                    | Already cut over by |
| -------------------------------------------------------- | ----------------------------------------------------------- | ------------------- |
| Radarr URL + API key (`radarr_url`, `radarr_api_key`)    | `core.settings` (generic settings table on `core.db`)       | Stays on core       |
| Sonarr URL + API key (`sonarr_url`, `sonarr_api_key`)    | `core.settings`                                             | Stays on core       |
| Rotation defaults (`rotation_quality_profile_id`, …path) | `core.settings`                                             | Stays on core       |
| "Protected" marker on a movie (`movies.rotation_status`) | `media.movies` column on `media.db` (via `getMediaDrizzle`) | PRD-165 PR 3        |

The PRD's original data model (`arr_instances`, `arr_protected_items`) was speculative — those tables do not exist in the codebase. The `*arr` URL + API key are 4 rows in the generic `settings` table on `core.db`, and "protected" is a `rotation_status='protected'` column on the existing `media.movies` row.

The only file in `media/arr/` that hits a DB handle is `service-settings.ts` (reads/writes the 4 settings keys via `getCoreDrizzle()`) and `download-and-protect.ts` (reads rotation defaults via `getCoreDrizzle()`, then writes `movies.rotation_status` via `getMediaDrizzle()`). Both handle choices are correct: the settings live on core (per the encryption / key-management boundary stated in the original PRD), and the movies write is already on the media pillar.

There is therefore **no slice to cut over** under this PRD. No package scaffold, no shared-journal split, no handle flip, no shim to delete.

## API Surface

| Procedure (namespace)             | File                                              | DB handle today                          |
| --------------------------------- | ------------------------------------------------- | ---------------------------------------- |
| `media.radarr.*` settings I/O     | `media/arr/service-settings.ts`                   | `getCoreDrizzle()` (correct — stays)     |
| `media.radarr.*` HTTP ops         | `media/arr/radarr-client.ts`, `radarr-procedures` | none (outbound HTTP)                     |
| `media.sonarr.*` HTTP ops         | `media/arr/sonarr-client.ts`, `sonarr-procedures` | none (outbound HTTP)                     |
| `media.radarr.downloadAndProtect` | `media/arr/download-and-protect.ts`               | `getMediaDrizzle()` for the movies write |

The HTTP clients (`radarr-client.ts`, `sonarr-client.ts`, `base-client.ts`) make outbound calls to Radarr/Sonarr — no DB at all.

## Business Rules

- The `*arr` URL + API key live on `core.settings`. They stay there: this is the same boundary the original PRD called out for encryption / key-management. No move.
- "Protected" is not a separate table; it is `movies.rotation_status = 'protected'`. The `movies` table already lives on `media.db` (PRD-165). The write in `download-and-protect.ts` is already on `getMediaDrizzle()`.
- Rotation defaults (`rotation_quality_profile_id`, `rotation_root_folder_path`) are also `core.settings` rows. They stay on core for the same reason as the API keys.

## Edge Cases

| Case                                                     | Behaviour                                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `*arr` instance unreachable                              | Outbound HTTP fails inside the client; existing error semantics preserved. Not a DB concern.                 |
| Settings row missing for `radarr_url` / `radarr_api_key` | `getRadarrClient()` returns `null`; procedures surface `PRECONDITION_FAILED`. Existing behaviour; no change. |
| Marking a movie as protected when no library row exists  | `markMovieProtected` throws `NOT_FOUND` (no `movies` row to update). Existing behaviour; no change.          |

## User Stories

This PRD has no shippable code work. The investigation outcome is the deliverable; no user stories are tracked.

| #   | Story                       | Outcome                                                                                                    |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 01  | PR 1 — Package scaffold     | N/A — no tables in this slice; nothing to scaffold into `@pops/media-db`.                                  |
| 02  | PR 2 — Shared journal split | N/A — no `arr_*` tables are owned by shared `pops.db`.                                                     |
| 03  | PR 3 — Cutover              | N/A — settings handle (`core.db`) is intentionally on core; movies handle (`media.db`) is already correct. |
| 04  | PR 4 — Shim deletion        | N/A — no shim exists.                                                                                      |

## Out of Scope

- API key encryption mechanics (stays on core; envelope key pattern unchanged).
- `*arr`-side scheduling / job queuing changes.
- New `*arr` integrations (Lidarr, Readarr, etc.).
- The eventual SDK-based cross-pillar settings read (Epic 05); `getCoreDrizzle()` is the correct in-process handle until then.
