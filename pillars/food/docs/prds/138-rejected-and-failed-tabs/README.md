# PRD-138: Rejected & Failed Ingest Tabs

> Epic: [03 — Draft Review & Approval](../../epics/03-draft-review.md)

## Overview

The two non-default tabs inside `/food/inbox`: "Rejected" (archived drafts that were rejected via the inbox) and "Failed ingests" (ingest sources where the worker reported `ok: false` and no draft was created). PRD-134 owns the tab shell and the Drafts tab; this PRD owns the other two tabs' rows, filters, and tab-specific actions (Undo for rejected, Retry for failed). Keeps the queue's primary surface focused on pending work while still giving the user a path to recover from mistakes and to triage worker failures.

The two tabs ship together because they share the same JOIN shape (ingest_sources outer-joined to a recipe_version) and the same row layout primitives, but their data and actions are distinct enough that PRD-134's Drafts tab would balloon if it tried to handle all three.

## Tabs

### "Rejected" tab

#### What it shows

Archived `recipe_versions` rows that have a corresponding `recipe_version_rejections` row (PRD-136). One row per version. Sort: `rejected_at DESC` (newest first). No heuristic sort here — these are already triaged.

Filter chips:

- Reason (multi-select): `wrong-recipe`, `low-quality-extraction`, `duplicate`, `not-a-recipe`, `other`.
- Ingest kind (multi-select): `url-web`, `url-instagram`, `text`, `screenshot`.
- Date range: last 7 / 30 / 90 days / all (defaults to 30).

Row shows: title (or `<no title>`), reject reason chip, ingest kind chip, source URL or "(text)" / "(screenshot)" indicator, rejected-at relative time, ingest cost (read from PRD-133's `ai_inference_log`).

Per-row action: **Undo** — calls `food.inbox.unreject({ versionId })` (PRD-136). On success, the row disappears and a toast says "Restored to Drafts." A subsequent reload shows it back in the Drafts tab.

No per-row "View" — the inspector view is unchanged for archived versions (PRD-135 renders it read-only when `status = 'archived'`).

#### Server contract

```ts
food.inbox.listRejected: query({
  input: {
    reasons?: Array<'wrong-recipe' | 'low-quality-extraction' | 'duplicate' | 'not-a-recipe' | 'other'>,
    kinds?: Array<'url-web' | 'url-instagram' | 'text' | 'screenshot'>,
    sinceDays?: 7 | 30 | 90 | null,
    cursor?: string,
    limit?: number,
  },
  output: { items: RejectedRow[], nextCursor?: string },
});

export type RejectedRow = {
  versionId: number;
  recipeSlug: string;            // for inspector navigation
  sourceId: number;
  title: string | null;
  reason: 'wrong-recipe' | 'low-quality-extraction' | 'duplicate' | 'not-a-recipe' | 'other';
  note: string | null;
  rejectedAt: string;            // ISO
  ingestKind: 'url-web' | 'url-instagram' | 'text' | 'screenshot';
  sourceUrl: string | null;
  ingestCostUsd: number | null;  // sum of ai_inference_log rows for this source
};
```

The query JOINs `recipe_versions` → `recipe_version_rejections` (INNER; presence enforces "rejected-via-inbox") → `ingest_sources` (INNER; `source_id IS NOT NULL` per PRD-136's `NotIngestOriginated` rule) → `recipes` (INNER) → `ai_inference_log` (LEFT JOIN aggregated SUM where `ai_inference_log.context_id = 'ingest_source:' || ingest_sources.id`; PRD-133 uses string-namespaced `context_id` rather than a numeric FK).

### "Failed ingests" tab

#### What it shows

`ingest_sources` rows whose persisted meta corresponds to an `ok: false` job result (per PRD-125's `IngestJobResult` shape — workerComplete persisted the failure meta) AND there is no successful retry (see below). **Auth-dead Instagram reels are NOT in this tab** — per PRD-130, `auth-dead` is a `partialReason` on an `ok: true` job (a placeholder draft is created) so it lives in the Drafts tab and is heuristically marked `blocked` via PRD-137's `PARTIAL_AUTH_DEAD` signal.

Sort: `ingested_at DESC`.

Filter chips:

- Error code (multi-select; populated from the union of error codes that handlers 127-132 actually emit). Known v1 values: `InstagramRateLimited`, `InstagramAcquisitionFailed`, `InstagramArtifactsMissing` (PRD-129/130), `AllExtractionPathsFailed` (PRD-130), `Timeout` (PRD-125), `DraftDeletedDuringIngest` (PRD-125). Plus an `Other` bucket for anything not in the known list. The full set is discovered at query time (`SELECT DISTINCT errorCode FROM ingest_sources WHERE ...`) so newly-introduced codes auto-populate.
- Ingest kind (multi-select).
- Date range (same as Rejected tab).

Row shows: source URL or "(text)" / "(screenshot)", ingest kind, error code chip, error message (truncated to 120 chars), ingested-at relative time, attempt count.

Per-row actions:

- **Retry** — calls PRD-125's `food.ingest.retry({ sourceId })`. On success, the row disappears (the source is now `pending`) and a toast says "Re-queued." Polling resumes via the Drafts tab.
- **View source** — opens a small dialog showing the original input (URL / pasted text / screenshot thumbnail) for the user to inspect before retrying. No DSL editor (there's no draft to edit).

#### Server contract

```ts
food.inbox.listFailed: query({
  input: {
    errorCodes?: string[],          // matched literally against extracted_json.errorCode
    kinds?: Array<'url-web' | 'url-instagram' | 'text' | 'screenshot'>,
    sinceDays?: 7 | 30 | 90 | null,
    cursor?: string,
    limit?: number,
  },
  output: { items: FailedRow[], nextCursor?: string },
});

export type FailedRow = {
  sourceId: number;
  ingestKind: 'url-web' | 'url-instagram' | 'text' | 'screenshot';
  sourceUrl: string | null;
  errorCode: string;
  errorMessage: string;
  ingestedAt: string;
  attempts: number;
};
```

The "no successful retry" rule: a source is in the Failed tab iff its **latest** meta represents a failure. If the user clicks Retry and a subsequent attempt succeeds, `extracted_json` is overwritten with the success meta (PRD-125's `workerComplete` rule) and the row disappears from this tab (and shows up in the Drafts tab via PRD-134 instead).

All rows in this tab are retryable. (Auth-dead, the only non-retryable Instagram failure, doesn't reach this tab — see PRD-130.) The Retry button is always enabled.

#### errorCode / errorMessage / attempts persistence

`FailedRow.errorCode`, `errorMessage`, and `attempts` are read from new dedicated columns on `ingest_sources` (`error_code`, `error_message`, `attempts`) introduced by the PRD-125 amendment described below. They survive BullMQ's job TTL; queryable in SQL. The Failed tab's "no successful retry" rule is implemented as `WHERE error_code IS NOT NULL` (a successful retry clears those columns).

## Routes

PRD-134 owns the route table and the tab shell. PRD-138 only specifies the URL fragments that scope each tab:

- `/food/inbox?tab=drafts` — Drafts (PRD-134; default)
- `/food/inbox?tab=rejected` — this PRD's first tab
- `/food/inbox?tab=failed` — this PRD's second tab

Tab state is a URL query param so refreshes preserve context. Filter chips and cursor live in URL hash to avoid polluting browser history with every chip toggle.

## Components

```
packages/app-food/src/pages/inbox/
├── RejectedTab.tsx          // PRD-138
├── RejectedRow.tsx          // PRD-138
├── FailedTab.tsx            // PRD-138
├── FailedRow.tsx            // PRD-138
└── ViewSourceDialog.tsx     // PRD-138
```

Each tab is a self-contained React component that mounts when its tab is active. The dashboard shell (tab strip + filter container) lives in PRD-134's `InboxLayout.tsx`.

The `ViewSourceDialog` renders per-kind:

- `url-*` → `<a href>` with title (fetched from `ingest_sources.url`) + a small preview iframe (sandboxed).
- `text` → `<pre>` of `ingest_sources.caption`.
- `screenshot` → `<img>` of the saved screenshot (`${FOOD_INGEST_DIR}/<sourceId>/screenshot.<ext>`).

No editing — read-only.

## Business Rules

- Rejected tab is driven by the `recipe_version_rejections` table (PRD-136). PRD-119's "Discard a draft" archives versions without writing a rejections row; those drafts NEVER appear in this tab.
- Failed tab is driven by `ingest_sources.extracted_json` where the persisted meta corresponds to a failed `workerComplete` (PRD-125). Pending or processing ingests (no terminal meta yet) are NOT in this tab.
- Auth-dead Instagram reels do NOT appear in this tab. Per PRD-130, they surface as partial drafts in the Drafts tab with PRD-137 marking them `blocked`. The user follows the IG cookie refresh runbook (`pillars/food/docs/runbooks/instagram-cookie-refresh.md`) then opens the inspector on the partial draft and triggers Retry there (see PRD-135).
- Failed tab does not "auto-clean" on retry; the row disappears the next time the user refreshes (or the tab's React Query invalidation fires) because the underlying meta has flipped to success/pending.
- Undo on a Rejected row puts the version back to `status='draft'` and removes the rejections row. PRD-134's Drafts tab will surface it again on next load.
- Both tabs use cursor pagination; default `limit=20`.
- Both tabs share PRD-134's empty-state component but with tab-specific copy:
  - Rejected (empty): "No rejected drafts. When you reject a draft, it'll land here so you can recover if you change your mind."
  - Failed (empty): "No failed ingests. Worker problems will surface here with a Retry button."

## Edge Cases

| Case                                                                                                                             | Behaviour                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User clicks Undo on a row whose recipe was archived after the rejection                                                          | PRD-136's `unreject` succeeds (flips version to draft). UI banner on Drafts tab next load: "Parent recipe is archived; un-archive at /food/recipes/:slug to publish."         |
| User clicks Undo twice quickly                                                                                                   | First call succeeds. Second call returns `NotArchived` (PRD-136). UI debounces the button; server defends.                                                                    |
| Failed-ingest tab shows a row whose source was successfully retried in another tab                                               | React Query's polling (60s) re-fetches `listFailed`; the row disappears on next refresh. Manual refresh button accelerates.                                                   |
| Failed row's `attempts` value is missing or zero                                                                                 | Row still renders and is retryable. The "PRD-125 amendment" persists `attempts` to the DB, so v1 should not see this case after the amendment lands.                          |
| Source is in Failed tab AND user opens it via `View source` and the screenshot file was deleted by housekeeping (PRD-110's FIFO) | Dialog shows "Source media no longer available (rotated out)." Retry button still works if the kind is `text` or `url-*`; for `screenshot`, retry is disabled with a tooltip. |
| Rejected row's note approaches the 2000-char cap (per PRD-136)                                                                   | Row truncates display to ~120 chars; full note shown in PRD-135's inspector "Rejection details" panel rendered for archived-rejected views.                                   |
| Two consecutive failed attempts on the same source produce two meta blobs                                                        | Only the latest is persisted (`extracted_json` is overwritten). Row in Failed tab reflects the latest attempt; older attempts are not separately listed.                      |
| User filters Rejected tab to `reason=duplicate` with no matching rows                                                            | Empty state for the filtered view: "No rejected drafts match your filters."                                                                                                   |
| Failed tab shows a row whose `errorCode` is not in the known list                                                                | Row's chip renders as "Other (`<errorCode>`)". The Error-code filter chip includes an "Other" bucket that matches any unknown code.                                           |
| User opens View Source on a URL ingest where the source has been HTTP 404'd since                                                | The iframe shows a browser-default 404; the link is still clickable. No special handling.                                                                                     |

## Acceptance Criteria

Inline per theme protocol.

### Rejected tab

- [x] `food.inbox.listRejected` lives in `apps/pops-api/src/modules/food/inbox/router.ts` (sibling to the PRD-136 mutations) and returns `RejectedRow[]` matching the shape above.
- [x] Cursor pagination works (`limit=20` default; `nextCursor` opaque base64url of `rejected_at|version_id`).
- [x] Filter combinations (reason × kind × sinceDays) all run in one SQL query (no N+1).
- [x] `RejectedTab.tsx` renders rows with reject reason chip, kind chip, source URL truncated to 60 chars, relative time.
- [x] Per-row Undo button calls `food.inbox.unreject` and on success removes the row optimistically; on error toasts the failure code (mapped to `inbox.rejected.undo.failure.<reason>`).
- [ ] Filter chips drive URL query params; resetting filters clears them from the URL. _PRD-134 owns URL hash → state wiring; PRD-138 ships the filter state via `initialFilters` prop ready to consume URL hash._
- [x] Empty state surfaces the recovery message.

### Failed tab

- [x] `food.inbox.listFailed` returns `FailedRow[]` matching the shape above and excludes sources whose latest meta represents success (driven by `WHERE error_code IS NOT NULL` per the PRD-125 amendment).
- [x] All rows in `listFailed` are retryable (auth-dead is in Drafts tab; this tab carries only `ok:false` ingests).
- [x] `FailedTab.tsx` renders rows with kind chip, error code chip, error message truncated to 120 chars, attempts count, ingested-at relative time.
- [x] Per-row Retry button calls PRD-125's `food.ingest.retry`; on success removes the row optimistically and toasts "Re-queued."
- [x] Per-row "View source" opens `ViewSourceDialog` rendering per-kind content.
- [ ] Auth-dead rows show a disabled Retry with a tooltip linking to `pillars/food/docs/runbooks/instagram-cookie-refresh.md`. _Auth-dead drafts never reach this tab per PRD-130 (they surface in the Drafts tab as partial drafts); the disabled-retry-tooltip surface is only reachable if a future handler emits an `error_code` for auth-dead — left unchecked until that path exists._

### View source dialog

- [x] Renders text ingests as `<pre>` with `white-space: pre-wrap`.
- [x] Renders screenshots from `${FOOD_INGEST_DIR}/<sourceId>/screenshot.<ext>` (served via the existing `/api/food/ingest/source/:sourceId/screenshot` endpoint shipped in PRD-125).
- [x] Renders URL ingests with the URL as a clickable link + a sandboxed iframe (`sandbox="allow-same-origin"` only; no scripts).
- [x] Closes on Esc, click outside, or close button (Radix Dialog primitive handles all three).

### Tests

- [x] Vitest integration at `apps/pops-api/src/modules/food/__tests__/inbox-rejected-failed.test.ts`:
  - `listRejected` filters by reason / kind / sinceDays correctly and excludes PRD-119-discarded drafts.
  - `listFailed` excludes sources with success-meta.
  - `listFailed` excludes sources whose latest meta is `ok: true` even when `partialReason='auth-dead'` (those land in PRD-134's Drafts tab).
- [x] Vitest + RTL at `packages/app-food/src/pages/inbox/__tests__/{RejectedTab,FailedTab,ViewSourceDialog}.test.tsx`:
  - Undo flow optimistic update + rollback on error.
  - Retry flow optimistic update + rollback on error.
  - Filter chip toggles reach the query input. _URL-param reflection deferred with PRD-134._
  - Empty states render.

## Out of Scope

- Bulk undo / bulk retry — explicit no-go per Epic 03's Key Decisions.
- Permanent delete of rejected drafts — out of scope; the rejections row + archived version persist for analytics. A future housekeeping PRD may add a purge.
- Diff view between consecutive failed-then-retried-then-failed attempts — out of scope (latest-only).
- Editing the reject reason from the Rejected row (right now you'd undo, edit, re-reject) — out of scope.
- Re-running the LLM extraction with a different model from the Failed tab — out of scope; the retry path uses the same pipeline version. Future PRD may add per-retry model overrides.
- A history view ("show me all retries of this source") — out of scope.
- Showing rejected drafts inside `/food/recipes/:slug/drafts` (PRD-119) — PRD-119 already shows all archived versions; no need to special-case rejected ones there.

## Requires (cross-PRD dependencies)

- **PRD-110** — `ingest_sources` table; `extracted_json` shape. PRD-138 reads it for failure meta.
- **PRD-119** — `archiveVersion` (called transitively through PRD-136's unreject; not directly here).
- **PRD-125** — `food.ingest.retry` mutation; `IngestJobResult` failure shape. The Failed tab consumes these.
- **PRD-125** (or **PRD-110** if preferred) — needs to expose an HTTP endpoint that serves `${FOOD_INGEST_DIR}/<sourceId>/screenshot.<ext>`. PRD-138's ViewSourceDialog requires it; the endpoint is not yet defined in either PRD. PRD-138 specifies the contract: `GET /api/food/ingest/source/:sourceId/screenshot` returns the file with `Content-Type: image/*`; 404 if the source is not a screenshot kind or the file rotated out. **Amend PRD-125 to expose this** (see "PRD-125 amendment" below).
- **PRD-129 / PRD-130** — `InstagramRateLimited`, `InstagramAcquisitionFailed`, `InstagramArtifactsMissing`, `AllExtractionPathsFailed` error codes populate the Error-code filter chip. Auth-dead does NOT appear here (per PRD-130).
- **PRD-133** — `ai_inference_log` for the Rejected row's `ingestCostUsd`.
- **PRD-136** — `recipe_version_rejections` table + `food.inbox.unreject` mutation.

## PRD-125 amendment

PRD-125 currently exposes the worker-facing internal mutation (`workerComplete`) and the user-facing `start` / `status` / `list` / `cancel` / `retry` mutations. PRD-138 requires three additions:

### 1. Persist errorCode + errorMessage + attempts on `ingest_sources` (schema delta)

Today `workerComplete`'s `ok: false` path writes only the meta-JSON rollup. The Failed tab needs these as queryable columns:

```sql
ALTER TABLE ingest_sources ADD COLUMN error_code TEXT;
ALTER TABLE ingest_sources ADD COLUMN error_message TEXT;
ALTER TABLE ingest_sources ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
```

`workerComplete`'s `ok: false` branch UPDATEs all three. The `ok: true` branch nulls `error_code` and `error_message` (a successful retry clears the prior failure record) and increments `attempts`. The `start` mutation initialises `attempts = 0`; `retry` increments.

### 2. Screenshot file endpoint

PRD-138 (and PRD-135 via the inspector's provenance pane) needs a way to serve the saved screenshot:

- `GET /api/food/ingest/source/:sourceId/screenshot` — serves the screenshot file for a `kind='screenshot'` source. Server discovers the file by globbing `${FOOD_INGEST_DIR}/<sourceId>/screenshot.*` (the supported extensions are `.jpg`, `.jpeg`, `.png`, `.webp`; matches PRD-110's storage rule once that PRD aligns to `screenshot.<ext>`). Returns `image/jpeg`, `image/png`, or `image/webp` per the discovered extension. 404 if the kind doesn't match or the file rotated out per PRD-110's FIFO.

### 3. IG video file endpoint (also needed by PRD-135's inspector)

- `GET /api/food/ingest/source/:sourceId/video` — serves the saved Instagram reel video for a `kind='url-instagram'` source. Path: `${FOOD_INGEST_DIR}/<sourceId>/video.mp4` (matches PRD-130's storage). Returns `video/mp4` with `Accept-Ranges: bytes` (HTTP range support so the browser `<video>` can seek). 404 if the kind doesn't match or the file rotated out.

All three changes are small and additive. The migration + endpoints live in PRD-125; PRDs 138 and 135 are consumers.

### PRD-110 alignment

PRD-110's filesystem layout currently shows `screenshot.png` only. PRD-138/PRD-125's endpoint requires the broader extension set above. PRD-110's layout doc should be updated to `screenshot.<ext>` with the supported set listed; the API surface in PRD-125 enforces the actual write extension.
