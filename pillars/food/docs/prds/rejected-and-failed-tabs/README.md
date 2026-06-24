# Rejected & Failed Ingest Tabs

Status: **Done** — both tabs, their REST endpoints, the media-serving endpoints, and the React surfaces ship and are on `main`. Three deferrals carried as ideas: per-source **ingest cost** is no longer tracked in the food DB (the column is always `null`); the **text** View-Source path renders a stub instead of the saved caption; and **query-level server tests** for the Rejected/Failed filtering + exclusion rules are not yet written (the wire envelopes + RTL surfaces are tested, the query internals are verified by hand). See `../../ideas/`.

The two non-default tabs inside `/food/inbox`: **Rejected** (archived drafts that were rejected via the inbox) and **Failed ingests** (ingest sources where the worker reported a failure and no draft survived). The Drafts tab and the tab shell are owned elsewhere; this surface owns the Rejected/Failed rows, filters, and tab-specific actions (Undo for rejected, Retry for failed). It keeps the queue's primary surface focused on pending work while still giving a path to recover from mistakes and triage worker failures.

Both tabs share row-layout primitives and the `?tab=` URL plumbing, but their data shapes and actions are distinct enough to live as separate components.

## Data model (food DB)

- `ingest_sources` — one provenance row per ingest run. Relevant columns: `kind` (`url-web` | `url-instagram` | `text` | `screenshot`), `url`, `caption`, `video_path`, `ingested_at`, `archived_at` (set by the FIFO media-eviction job — the row persists, only the files are gone), and the failure triple `error_code` / `error_message` / `attempts`. `attempts` defaults to `0` (set by `ingest/start`, incremented by `ingest/retry`). `error_code` + `error_message` are written as a pair on a failed worker callback and cleared as a pair on the next success.
- `recipe_versions` — the archived draft. `source_id` FKs back to `ingest_sources`.
- `recipe_version_rejections` — presence of a row distinguishes an inbox reject from a manual discard. Carries `reason`, `note`, `rejected_at`.

There is **no** per-source ingest-cost record in the food DB. AI telemetry moved to the `ai` pillar (`@pops/ai-telemetry`); the Rejected row's `ingestCostUsd` field is always `null`. Restoring cost is an idea (see `../../ideas/rejected-ingest-cost.md`).

## REST API surface

All paths are under the food pillar contract (`/inbox/...`). List reads are POST-with-body because the filter arrays + opaque cursor don't round-trip cleanly through query strings.

- `POST /inbox/rejected` → `{ items: RejectedRow[], nextCursor: string | null }`. Body: `{ reasons?, kinds?, sinceDays?: 7|30|90|null, cursor?, limit? }`. Default `limit=20`, max `100`.
  - `RejectedRow = { versionId, recipeSlug, sourceId, title, reason, note, rejectedAt, ingestKind, sourceUrl, ingestCostUsd }`. `ingestCostUsd` is always `null`.
- `POST /inbox/failed` → `{ items: FailedRow[], nextCursor: string | null }`. Body: `{ errorCodes?: string[], kinds?, sinceDays?, cursor?, limit? }`.
  - `FailedRow = { sourceId, ingestKind, sourceUrl, errorCode, errorMessage, ingestedAt, attempts }`.
- `GET /inbox/failed/error-codes` → `{ items: string[] }`. `SELECT DISTINCT error_code` — drives the error-code filter chip so newly-emitted codes auto-populate.
- `POST /inbox/unreject` → discriminated `{ ok: true, restoredAs: 'draft' }` | `{ ok: false, reason }`. Restores a rejected version to `status='draft'` and removes the rejections row.
- `POST /inbox/retry` (in the `ingest.*` sub-router) → re-enqueues a failed source from its persisted row; `503` when Redis is unconfigured.
- `GET /ingest/source/:sourceId/screenshot` and `GET /ingest/source/:sourceId/video` — plain Express handlers (mounted before the ts-rest POST surface, no collision). Serve the saved media for the View-Source dialog. Both fail closed: `404` if the source row is missing, `archived_at` is set, or the file is gone from disk. `res.sendFile` handles Range requests so `<video>` seeking works.

### Query shapes

- **Rejected**: `recipe_version_rejections` INNER JOIN `recipe_versions` INNER JOIN `ingest_sources` INNER JOIN `recipes` (slug for inspector nav). One SQL pass; no N+1. Ordered `rejected_at DESC, version_id DESC`. Cursor is an opaque encoding of `(rejected_at, version_id)`.
- **Failed**: single-table read on `ingest_sources` with `WHERE error_code IS NOT NULL AND error_message IS NOT NULL` (both predicates pinned so a half-backfilled row can't surface an empty message). Ordered `ingested_at DESC, id DESC`. Cursor encodes `(ingested_at, id)`.

## UI

Tab state lives in the `?tab=` query param (`drafts` default, `rejected`, `failed`) so refresh and shared links preserve context. Components under `pillars/food/app/src/pages/inbox/`: `RejectedTab` + `RejectedRow` + `RejectedFilters` + `useRejectedTab`; `FailedTab` + `FailedRow` + `FailedFilters` + `useFailedTab`; `ViewSourceDialog`.

**Rejected tab** — rows sorted newest-first (already triaged, no heuristic sort). Filter chips: reason (multi), ingest kind (multi), date range (7/30/90/all, default 30). Row shows title (or `<no title>`), reason chip, kind chip, source URL truncated to 60 chars (or text/screenshot indicator when no URL), rejected-at relative time. Per-row **Undo** calls `unreject` with optimistic row removal; on a `{ ok: false }` result it toasts `inbox.rejected.undo.failure.<reason>`; on success toasts "Restored to Drafts." No per-row View (the inspector renders archived versions read-only).

**Failed tab** — rows sorted `ingested_at DESC`. Filter chips: error code (multi, populated from `/inbox/failed/error-codes` plus an "Other" bucket for unknown codes), ingest kind, date range. Row shows source URL (or text/screenshot indicator), kind chip, error-code chip, error message truncated to 120 chars, attempts count, ingested-at relative time. Per-row **Retry** calls `ingest/retry` with optimistic removal and a "Re-queued" toast (the next poll won't resurface it because `error_code` is now `null`). Per-row **View source** opens `ViewSourceDialog`. All rows are retryable.

**ViewSourceDialog** (read-only, Radix `Dialog` — closes on Esc / outside-click / close button):

- `screenshot` → `<img src="/food-api/ingest/source/<id>/screenshot">`.
- `url-*` → clickable `<a target="_blank" rel="noreferrer noopener">` plus a sandboxed `<iframe sandbox="allow-same-origin" referrerPolicy="no-referrer">` (no scripts).
- `text` → currently a `<pre>` stub explaining how to inspect, **not** the saved caption (see idea `../../ideas/view-source-text-caption.md`).

## Business rules

- Rejected tab is driven solely by `recipe_version_rejections`. Drafts archived without a rejections row (manual discard) never appear here.
- Failed tab is driven by `error_code IS NOT NULL`. Pending/processing sources (no terminal failure) are excluded. A source whose latest run succeeds clears `error_code`/`error_message`, so it drops out and reappears as a draft.
- **Auth-dead Instagram reels are NOT in the Failed tab.** Auth-dead is an `ok: true, partialReason: 'auth-dead'` outcome — a placeholder draft is created — so it lives in the Drafts tab, heuristically marked `blocked`. The recovery path is the IG cookie-refresh runbook (`pillars/food/docs/runbooks/instagram-cookie-refresh.md`), then Retry from the inspector.
- Neither tab "auto-cleans" on action; the row disappears on the next refetch (React Query invalidation) once the underlying state has flipped.
- Both tabs use cursor pagination, default `limit=20`.
- Empty states carry tab-specific recovery copy.

## Edge cases

| Case                                                                 | Behaviour                                                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Undo on a row whose recipe was archived after rejection              | `unreject` succeeds (flips version to draft); a Drafts-tab banner explains the parent recipe is archived.                |
| Undo clicked twice quickly                                           | First succeeds; second returns `{ ok: false, reason: 'NotArchived' }`. Button is disabled while pending; server defends. |
| Failed row retried from another surface                              | Polling refetch drops it on next cycle.                                                                                  |
| `attempts` missing/zero                                              | Row still renders and is retryable; `attempts` defaults to `0` in schema.                                                |
| Media file deleted by FIFO eviction (`archived_at` set or file gone) | Endpoint returns `404`; the dialog treats 404 as "no media, skip rendering."                                             |
| `errorCode` not in the known list                                    | Chip renders as an "Other (`<code>`)" bucket; the error-code filter's "Other" matches any unknown code.                  |
| Two consecutive failures on one source                               | Only the latest `error_code`/`error_message` persist (overwritten); the row reflects the latest attempt.                 |
| View Source on a URL that now 404s                                   | The iframe shows the site's own 404; the link stays clickable. No special handling.                                      |

## Acceptance criteria

Rejected:

- [x] `POST /inbox/rejected` returns `RejectedRow[]` from one JOIN (no N+1), filtered by reason × kind × sinceDays, sorted `rejected_at DESC, version_id DESC`, cursor-paginated (`limit=20` default).
- [x] Only inbox-rejected drafts appear (driven by presence of a `recipe_version_rejections` row); manually-discarded archived versions are excluded.
- [x] `RejectedTab` renders reason chip, kind chip, source URL truncated to 60 chars (or text/screenshot indicator), relative time; empty state shows recovery copy.
- [x] Undo calls `POST /inbox/unreject`, removes the row optimistically, rolls back + toasts `inbox.rejected.undo.failure.<reason>` on `{ ok: false }`.
- [x] `ingestCostUsd` is present in the row schema but always `null` (cost tracking moved to the `ai` pillar); the UI suppresses the cost line.

Failed:

- [x] `POST /inbox/failed` returns `FailedRow[]` with `WHERE error_code IS NOT NULL AND error_message IS NOT NULL`, sorted `ingested_at DESC, id DESC`, cursor-paginated.
- [x] Sources whose latest run succeeded (or that are `ok:true, partialReason:'auth-dead'`) are excluded — auth-dead surfaces in the Drafts tab, not here.
- [x] `GET /inbox/failed/error-codes` returns the distinct set so the filter chip auto-populates new codes.
- [x] `FailedTab` renders kind chip, error-code chip, error message truncated to 120 chars, attempts count, relative time.
- [x] Retry calls `POST /ingest/retry`, removes the row optimistically, toasts "Re-queued," rolls back on error.
- [x] View source opens `ViewSourceDialog` with per-kind content.

View source & media:

- [x] `GET /ingest/source/:sourceId/screenshot` serves `jpg|jpeg|png|webp` with the right `Content-Type`; `404` when the source is missing/archived/file-gone.
- [x] `GET /ingest/source/:sourceId/video` serves `mp4|webm|mov|m4v` and supports Range requests (`res.sendFile`) so `<video>` seeking works.
- [x] Screenshot renders as `<img>`; URL renders as link + sandboxed (`allow-same-origin`, scripts off) iframe; dialog closes on Esc / outside-click / close button.
- [ ] Text View-Source renders the saved `ingest_sources.caption` — currently a stub placeholder (idea `../../ideas/view-source-text-caption.md`).

Tests:

- [x] Server integration (`src/api/__tests__/inbox.test.ts`): the `listRejected` / `listFailed` / `failedErrorCodes` REST envelopes (empty-page shape, `nextCursor: null`) plus the mutation/inspector guards (`VersionNotFound`, `NoteRequired`, `SourceNotFound`).
- [x] RTL (`app/src/pages/inbox/__tests__/{RejectedTab,FailedTab,ViewSourceDialog}.test.tsx`): undo + retry optimistic update and rollback, filter-chip toggles reaching the query input, empty states, View-Source per-kind body (link + sandboxed iframe, screenshot `<img>`, close affordance).
- [ ] Query-level server tests for `listRejected` filtering + manual-discard exclusion and `listFailed` success-meta + auth-dead exclusion are not yet written — the behaviour rests on manual verification and the type system (idea `../../ideas/inbox-rejected-failed-query-test-coverage.md`).

## Out of scope

- Bulk undo / bulk retry.
- Permanent delete of rejected drafts (the rejections row + archived version persist for analytics; a future housekeeping purge may add it).
- Diff view across failed-then-retried attempts (latest-only).
- Editing the reject reason from the Rejected row (undo → edit → re-reject).
- Re-running extraction with a different model from the Failed tab (retry reuses the same pipeline version).
- A per-source retry-history view.
