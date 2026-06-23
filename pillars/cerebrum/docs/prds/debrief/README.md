# Debrief

> Status: Partial — the full read/write/delete REST surface and its two tables ship and are exercised by unit tests, but no consumer calls it. The post-watch reflection feature is dormant: nothing on any pillar invokes `pillar('cerebrum').debrief.*` and no UI drives a session through its lifecycle. The surface exists so a future media-side flow can wire up against it without re-deriving the shape. See [ideas/debrief-consumers.md](../../ideas/debrief-consumers.md).

Post-watch reflection over media the user has finished. Cerebrum tracks one debrief **session** per (re-)watch and records per-dimension reflection **results** against it. The media tuple (`mediaType` + `mediaId`), `watchHistoryId`, `dimensionId` and `comparisonId` are soft pointers into the media pillar — denormalised onto the cerebrum rows with no cross-DB foreign key and no cross-pillar call leaking into this surface, so cerebrum's SQLite file stands alone. The surface is shaped for a best-effort, post-commit consumer (the media side commits its own transaction first, then fires a cerebrum call); it is not a transactional one. Non-identity domain — docker-network trust, no per-request auth.

## Data Model

Three tables in cerebrum's SQLite (`pillars/cerebrum/src/db/schema/debrief-*.ts`). The contract is the wire shape, mirroring the rows one-to-one rather than a UI projection.

**`debrief_sessions`** — one row per (re-)watch:

- `id` (int, PK, autoincrement)
- `watchHistoryId` (int, NOT NULL) — soft pointer into `media.watch_history`
- `mediaType` (`movie` | `episode`, nullable) · `mediaId` (int, nullable) — denormalised media tuple so `getByMedia` reads directly without joining `watch_history`
- `status` (`pending` | `active` | `complete`, default `pending`)
- `createdAt` (text, default `datetime('now')`)
- Index on `(mediaType, mediaId)`

**`debrief_results`** — per-session, per-dimension reflection outcome:

- `id` (int, PK, autoincrement)
- `sessionId` (int, NOT NULL, FK → `debrief_sessions.id`) — the one FK retained; it is intra-cerebrum
- `dimensionId` (int, NOT NULL) · `comparisonId` (int, nullable) — soft pointers into `media.comparison_dimensions` / `media.comparisons`
- `createdAt` (text, default `datetime('now')`)

**`debrief_status`** — per (media tuple, dimension) completion flags. Retained for data preservation; not exposed on the current contract:

- `id` (int, PK) · `mediaType` (text, NOT NULL) · `mediaId` (int, NOT NULL) · `dimensionId` (int, NOT NULL)
- `debriefed` (int, default 0) · `dismissed` (int, default 0)
- `createdAt` · `updatedAt`
- Unique index on `(mediaType, mediaId, dimensionId)`

## REST API Surface

Contract in `src/contract/rest-debrief.ts`, mounted at `debrief` on the cerebrum router. Every procedure is `POST` (typed inputs ride in the body):

- `POST /debrief/get` — fetch a session by `sessionId`. Returns `{ data: Session | null }`. A benign miss returns `{ data: null }`, not a 404.
- `POST /debrief/get-by-media` — most recent pending/active session for `{ mediaType, mediaId }`, newest-first. Returns `{ data: Session | null }`. Reads the denormalised columns directly — no join.
- `POST /debrief/list-pending` — paginated list of `pending` sessions, optionally narrowed by `{ mediaType?, mediaId? }`, with `{ limit?, offset? }` (default limit 50). Returns `{ data: Session[], pagination: { limit, offset, total } }` where `total` is the unpaged count.
- `POST /debrief/record` — record a per-dimension result `{ sessionId, dimensionId, comparisonId }` (`comparisonId` nullable for a skipped dimension). Returns `{ data: Result }`. `404` when the session is unknown.
- `POST /debrief` — create a session `{ watchHistoryId, mediaType, mediaId }`. Idempotent: deletes any prior pending/active session for the same media tuple, then inserts a fresh `pending` row. Returns `{ data: Session }`.
- `POST /debrief/log-watch-completion` — entry point for the post-watch flow; same body as create. Creates a session and returns `{ sessionId, dimensionsQueued }`. `dimensionsQueued` is always `0` (see Edge Cases).
- `POST /debrief/:sessionId/dismiss` — transition a session to `status = 'complete'` (the session-level terminal/dismissed state). Idempotent on an already-complete session. Returns `{ data: Session }`. `404` on an unknown id.
- `POST /debrief/delete-by-watch-history` — cascade-delete every debrief row pinned to `{ watchHistoryId }`. Returns `{ deletedSessions, deletedResults }`.

## Business Rules

- **Soft pointers only.** `watchHistoryId`, the media tuple, `dimensionId` and `comparisonId` are stored as plain columns; there is no cross-DB FK and no cross-pillar call inside this surface. The only FK is the intra-cerebrum `debrief_results.session_id → debrief_sessions.id`.
- **`create` / `logWatchCompletion` are idempotent on re-watch.** Both delete any prior `pending`/`active` session for the same `(mediaType, mediaId)` before inserting a fresh `pending` row. Re-running for the same media produces the same end-state; no de-dup token is needed.
- **`get` / `getByMedia` return null on a miss; `record` / `dismiss` 404.** The reads model a benign absence as `{ data: null }`. The state-changing calls 404 on an unknown session because that is a caller error, not an absence.
- **`dismiss` is the session-level terminal marker.** It sets `status = 'complete'`. There is no `dismissed` boolean on the session row; the per-(media, dimension) `debrief_status` flags are a separate, currently-unexposed table.
- **`deleteByWatchHistoryId` cascades explicitly.** Because `debrief_results` keeps its FK to `debrief_sessions` but the cross-pillar pointers do not, the delete runs inside a single transaction: dependent results first, then the sessions pinned to the watch row. Returns the row counts.
- **Rows are validated at the boundary.** Each row is parsed through the wire schema (`src/contract/rest-debrief-schemas.ts`) on the way out, so the nullable-text `media_type` column is narrowed to the `movie | episode` enum; a row that fails validation throws rather than widening the shape silently.

## Edge Cases

| Case                                                                 | Behaviour                                                                                                                                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get` / `getByMedia` for a media item with no debrief                | Returns `{ data: null }`. Not an error.                                                                                                                                                                             |
| `create` / `logWatchCompletion` for a media item already mid-debrief | Deletes the previous pending/active session and inserts a fresh `pending` one. The earlier session is dropped — no historical queue per media item.                                                                 |
| `dismiss` on an already-complete session                             | No-op. Returns the row unchanged. Idempotent.                                                                                                                                                                       |
| `dismiss` on an unknown session id                                   | `404`. (Contrast `get`, which returns `null` — `dismiss` is state-changing.)                                                                                                                                        |
| `record` against a non-existent session                              | `404`.                                                                                                                                                                                                              |
| `record` with `comparisonId: null`                                   | Accepted — represents a skipped dimension. Inserts the result row with a null comparison.                                                                                                                           |
| `deleteByWatchHistoryId` for a watch row with no debrief             | Returns `{ deletedSessions: 0, deletedResults: 0 }`. Not an error.                                                                                                                                                  |
| `listPending` with no filters                                        | Returns all `pending` sessions, paginated newest-first; `total` is the unpaged count. Completed sessions are excluded.                                                                                              |
| `logWatchCompletion.dimensionsQueued`                                | Always `0`. The status fan-out would need the media pillar's `comparison_dimensions`, which the cerebrum container has no handle to. The field stays on the wire so a future consumer flip is a pure consumer move. |

## Acceptance Criteria

Verified against `src/api/__tests__/debrief.test.ts`:

- [x] The contract exposes `debrief.{get, getByMedia, listPending, record, create, logWatchCompletion, dismiss, deleteByWatchHistoryId}` with zod-validated inputs/outputs, mounted on the cerebrum router.
- [x] `create` + `get` round-trip a session by id.
- [x] `get` returns `{ data: null }` for an unknown session id (benign miss, not 404).
- [x] `getByMedia` returns the most recent pending session for a media tuple, and `null` when none exists.
- [x] `create` replaces any prior pending/active session for the same media tuple (idempotent on re-watch).
- [x] `record` inserts a result row against an existing session, accepts a null `comparisonId`, and `404`s when the session does not exist.
- [x] `dismiss` transitions a session to `complete`, is idempotent on an already-complete session, and `404`s on an unknown id.
- [x] `logWatchCompletion` creates a session and reports `dimensionsQueued: 0`.
- [x] `deleteByWatchHistoryId` cascade-deletes sessions and their results, and returns zero counts for a watch-history id with no debrief rows.
- [x] `listPending` paginates pending sessions newest-first with the unpaged total, narrows by media tuple, and excludes completed sessions.

## Out of Scope

- **Wiring up consumers.** No pillar or UI drives the surface today. The media-side reflection flow that would call it is captured as [ideas/debrief-consumers.md](../../ideas/debrief-consumers.md).
- **Exposing `debrief_status`.** The per-(media, dimension) completion flags are retained for data preservation but not part of the current contract.
- **Transactional cross-pillar writes.** The surface is best-effort post-commit by design; a strict "both or neither" outbox is a separate concern if a consumer ever needs it.
