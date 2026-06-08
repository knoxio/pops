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

The query JOINs `recipe_versions` → `recipe_version_rejections` (INNER; presence enforces "rejected-via-inbox") → `ingest_sources` (INNER; `source_id IS NOT NULL` per PRD-136's `NotIngestOriginated` rule) → `recipes` (INNER) → `ai_inference_log` (LEFT JOIN aggregated SUM by `source_id`).

### "Failed ingests" tab

#### What it shows

`ingest_sources` rows where `extracted_json` is non-null AND it represents an `ok: false` job result (per PRD-125's `IngestJobResult` shape — workerComplete persisted the failure meta) AND there is no successful retry (see below).

Sort: `ingested_at DESC`.

Filter chips:

- Error code (multi-select; populated from distinct `extracted_json.errorCode` values seen in v1: `IGAuthDead`, `IGRateLimited`, `JSONLDExtractionFailed`, `LLMTimeout`, `VisionFailed`, `STTFailed`, `Timeout`, `DraftDeletedDuringIngest`, plus an `Other` bucket for anything not in the known list).
- Ingest kind (multi-select).
- Date range (same as Rejected tab).

Row shows: source URL or "(text)" / "(screenshot)", ingest kind, error code chip, error message (truncated to 120 chars), ingested-at relative time, attempt count (from BullMQ job history if available, else "?").

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
  attempts: number | null;          // null if BullMQ has aged the job out
  retryable: boolean;               // false iff errorCode === 'IGAuthDead' (per PRD-129)
};
```

The "no successful retry" rule: a source is in the Failed tab iff its **latest** meta represents a failure. If the user clicks Retry and a subsequent attempt succeeds, `extracted_json` is overwritten with the success meta (PRD-125's `workerComplete` rule) and the row disappears from this tab (and shows up in the Drafts tab via PRD-134 instead).

Auth-dead rows have `retryable = false` — the Retry button is disabled with a tooltip linking to the IG cookie runbook. Other error codes are retryable.

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
- An auth-dead row's Retry button is disabled. Surfacing it is enough — the operator must follow the IG cookie refresh runbook (`docs/runbooks/instagram-cookie-refresh.md`) before retrying. Once cookies refresh, the user clicks Retry manually.
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
| User clicks Retry on an auth-dead row                                                                                            | Button is disabled with a tooltip linking to the runbook. If the user somehow triggers it, PRD-125's `retry` re-enqueues; the worker fails again with the same error.         |
| Failed row has no `attempts` value (BullMQ aged it out)                                                                          | UI shows "?" for attempts; row still retryable.                                                                                                                               |
| Source is in Failed tab AND user opens it via `View source` and the screenshot file was deleted by housekeeping (PRD-110's FIFO) | Dialog shows "Source media no longer available (rotated out)." Retry button still works if the kind is `text` or `url-*`; for `screenshot`, retry is disabled with a tooltip. |
| Rejected row's note is 1900 chars                                                                                                | Row truncates display to ~120 chars; full note shown in inspector via PRD-135.                                                                                                |
| Two consecutive failed attempts on the same source produce two meta blobs                                                        | Only the latest is persisted (`extracted_json` is overwritten). Row in Failed tab reflects the latest attempt; older attempts are not separately listed.                      |
| User filters Rejected tab to `reason=duplicate` with no matching rows                                                            | Empty state for the filtered view: "No rejected drafts match your filters."                                                                                                   |
| Failed tab shows a row whose `errorCode` is not in the known list                                                                | Row's chip renders as "Other (`<errorCode>`)". The Error-code filter chip includes an "Other" bucket that matches any unknown code.                                           |
| User opens View Source on a URL ingest where the source has been HTTP 404'd since                                                | The iframe shows a browser-default 404; the link is still clickable. No special handling.                                                                                     |

## Acceptance Criteria

Inline per theme protocol.

### Rejected tab

- [ ] `food.inbox.listRejected` lives in `apps/pops-api/src/modules/food/inbox-router.ts` and returns `RejectedRow[]` matching the shape above.
- [ ] Cursor pagination works (`limit=20` default; `nextCursor` opaque base64 of the rejected-at timestamp + tie-breaking id).
- [ ] Filter combinations (reason × kind × sinceDays) all run in one SQL query (no N+1).
- [ ] `RejectedTab.tsx` renders rows with reject reason chip, kind chip, source URL truncated to 60 chars, relative time.
- [ ] Per-row Undo button calls `food.inbox.unreject` and on success removes the row optimistically; on error toasts the failure code.
- [ ] Filter chips drive query params; resetting filters clears them from the URL.
- [ ] Empty state surfaces the recovery message.

### Failed tab

- [ ] `food.inbox.listFailed` returns `FailedRow[]` matching the shape above and excludes sources whose latest meta represents success.
- [ ] `retryable` is `false` exactly when `errorCode === 'IGAuthDead'`; `true` otherwise.
- [ ] `FailedTab.tsx` renders rows with kind chip, error code chip, error message truncated to 120 chars, attempts count, ingested-at relative time.
- [ ] Per-row Retry button calls PRD-125's `food.ingest.retry`; on success removes the row optimistically and toasts "Re-queued."
- [ ] Per-row "View source" opens `ViewSourceDialog` rendering per-kind content.
- [ ] Auth-dead rows show a disabled Retry with a tooltip linking to `docs/runbooks/instagram-cookie-refresh.md`.

### View source dialog

- [ ] Renders text ingests as `<pre>` with `white-space: pre-wrap`.
- [ ] Renders screenshots from `${FOOD_INGEST_DIR}/<sourceId>/screenshot.<ext>` (served via the existing `/api/food/ingest/source/:sourceId/screenshot` endpoint — PRD-138 extends PRD-110 or PRD-125 to expose this; see "Cross-PRD dependencies").
- [ ] Renders URL ingests with the URL as a clickable link + a sandboxed iframe (`sandbox="allow-same-origin"` only; no scripts).
- [ ] Closes on Esc, click outside, or close button.

### Tests

- [ ] Vitest integration at `apps/pops-api/src/modules/food/__tests__/inbox-rejected-failed.test.ts`:
  - `listRejected` filters by reason / kind / sinceDays correctly and excludes PRD-119-discarded drafts.
  - `listFailed` excludes sources with success-meta.
  - `listFailed` correctly marks auth-dead as non-retryable.
- [ ] Vitest + RTL at `packages/app-food/src/pages/inbox/__tests__/RejectedTab.test.tsx` and `FailedTab.test.tsx`:
  - Undo flow optimistic update + rollback on error.
  - Retry flow optimistic update + rollback on error.
  - Filter chips reflect URL query params.
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
- **PRD-129** — `IGAuthDead` error code semantics drive `retryable = false`.
- **PRD-133** — `ai_inference_log` for the Rejected row's `ingestCostUsd`.
- **PRD-136** — `recipe_version_rejections` table + `food.inbox.unreject` mutation.

## PRD-125 amendment

PRD-125 currently exposes the worker-facing internal mutation (`workerComplete`) and the user-facing `start` / `status` / `list` / `cancel` / `retry` mutations. PRD-138 requires one additional read endpoint:

- `GET /api/food/ingest/source/:sourceId/screenshot` — serves the screenshot file for a `kind='screenshot'` source. Returns `image/jpeg`, `image/png`, or `image/webp`. 404 if the kind doesn't match or the file has rotated out per PRD-110's FIFO.

This is small enough to land as a PRD-125 amendment rather than a new PRD. Document the new endpoint in PRD-125's API section when this PRD is implemented; the corresponding acceptance criterion goes on PRD-138 (UI consumer) and on PRD-125 (the endpoint owner).
