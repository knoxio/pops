# PRD-171: media.arr cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move `media.arr.*` (Radarr/Sonarr integration) procedures + related tables into `media.db`. Follows the canonical N-track pattern from [PRD-165](../165-media-movies-cutover/README.md).

The \*arr surface is the bridge between pops and the Radarr/Sonarr download stack: register them with API keys, query their status, trigger searches, sync their library back into pops.

## Data Model

Tables (move from shared to `packages/media-db`):

- `arr_instances` — { id, type ('radarr' | 'sonarr'), base_url, api_key (encrypted), enabled }
- `arr_protected_items` — { id, item_type, item_id, protection_reason, set_at } (downloads pops doesn't want \*arr to delete)

API keys stay encrypted via the existing `core.serviceAccounts` envelope key pattern (the encryption side stays on core; only the encrypted blob moves to `media.db`).

## API Surface

| Procedure                    | Kind                        |
| ---------------------------- | --------------------------- |
| `media.arr.instances.list`   | query                       |
| `media.arr.instances.create` | mutation                    |
| `media.arr.instances.update` | mutation                    |
| `media.arr.instances.delete` | mutation                    |
| `media.arr.radarr.search`    | mutation (calls Radarr API) |
| `media.arr.radarr.queue`     | query (calls Radarr API)    |
| `media.arr.sonarr.*`         | similar shape for Sonarr    |
| `media.arr.protected.list`   | query                       |
| `media.arr.protected.add`    | mutation                    |
| `media.arr.protected.remove` | mutation                    |

Files today: `apps/pops-api/src/modules/media/arr/{radarr-router.ts, radarr-client.ts, radarr-procedures.ts, base-client.ts, download-and-protect.ts}`.

## Business Rules

Follows [PRD-165's 4-PR sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- \*arr HTTP clients (radarr-client.ts) make outbound calls to Radarr/Sonarr; they don't touch the DB directly. Only the persistence layer (instances list, protected items) moves.
- API keys are encrypted at the cell level today; encryption stays on core's key-management surface. The encrypted blob is opaque to media-api; it forwards the encrypted form to the existing decrypt service.

## Edge Cases

| Case                                                   | Behaviour                                                                                                                                                                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decryption requires reaching back to core to unwrap    | Encrypt/decrypt is centralised on `core.serviceAccounts`'s key-management; media-api calls into core via SDK (Epic 05). For now: in-process via the workspace `@pops/core-db` package; switches to SDK call after Epic 05 lands. |
| \*arr instance becomes unreachable                     | Outbound HTTP fails; preserved error semantics.                                                                                                                                                                                  |
| Backfill encounters an arr_instance with a missing key | Logged warning; instance row is copied but flagged disabled.                                                                                                                                                                     |

## User Stories

| #   | Story                                                       | Summary                                                                    |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — Schemas + services into `@pops/media-db`                            |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop from shared journal                                            |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip router to `getMediaDrizzle()`; keep encryption surface on core |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete or defer shim                                                |

## Out of Scope

- API key encryption mechanics (stays on core).
- \*arr-side scheduling / job queuing changes; only persistence moves.
- New \*arr integrations (e.g. Lidarr, Readarr).
