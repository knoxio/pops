# Draft Inspector

**Status: Partial.** The full three-pane inspector ships — route, `getForReview` aggregate, per-kind provenance, editor/renderer tabs, and the approve/reject/undo/re-run decision controls. Deferred polish (resizable panes, richer IG/web provenance, screenshot zoom, terminal-state banners, real per-source cost) lives in [draft-inspector-extensions](../ideas/draft-inspector-extensions.md). The provenance cost footer renders `$0.0000` today because food's local inference log was dropped when telemetry moved to the `ai` pillar.

The page that opens when a user clicks an inbox draft row: `/food/inbox/:sourceId`. A three-pane review surface — ingest provenance on the left, the DSL editor in the centre, the approve/reject decision on the right — so the user compares what the pipeline extracted against the source, edits the DSL, re-compiles, then approves or rejects in one place. Archived (rejected) versions render read-only with an Undo button instead.

## Route

`sourceId` is the `ingest_sources.id`. The draft is derived server-side: the most-recent `recipe_versions` row whose `source_id = :sourceId`. A source with no draft (pending / processing / failed) renders a degraded view (provenance pane only, plus a status message). An unknown `sourceId` renders a 404 with a link back to `/food/inbox`.

- [x] `/food/inbox/:sourceId` registered in `app/src/routes.tsx`, lazy-mounting `InspectorPage`.
- [x] Unknown / non-positive-integer `sourceId` → not-found view with a link back to `/food/inbox`.
- [x] `getForReview` returning `ok: false, reason: 'SourceNotFound'` → not-found view.

## Data model (consumed, not owned)

The inspector owns no tables. It composes a read-only aggregate from existing rows: `ingest_sources`, `recipe_versions` (+ parent `recipes`), `recipe_version_rejections`, `recipe_version_proposed_slugs`, resolver creations, and the quality heuristic.

`source.state` is derived from the DB row only (no BullMQ): a row with `error_code`/`error_message` is `failed`; a row with `draft_recipe_id` is `completed` (or `partial` when `extracted_json.partialReason` is set); otherwise `processing`. The 60s poll while non-terminal closes the gap with the worker.

## REST API surface

One endpoint backs the page; all mutations are existing inbox/recipe/ingest endpoints the panes call directly.

- `GET /food-api/inbox/review?sourceId=<int>` → `{ ok: true, review: { source, draft } }` or `{ ok: false, reason: 'SourceNotFound' }`.
  - `source`: `{ id, kind, url, caption, ingestedAt, extractorVersion, state, partialReason?, reviewedAt, archivedAt, errorCode, errorMessage, attempts, meta, inferenceLogs, totalCostUsd }`.
  - `draft` (null when no draft): `{ versionId, versionNo, recipeSlug, recipeArchivedAt, status, title, bodyDsl, compileStatus, compileError, compiledAt, rejection, proposedSlugs, creations, quality }`.
  - `compileError` is the parsed shape `{ phase, errors[{code,message,loc?}], errorCount, proposedSlugsCount }` (server parses the stored JSON); `quality` is `{ band, score, signals[{code,weight,detail?}] }`.
- `GET /food-api/ingest/source/:sourceId/screenshot` and `…/video` — raw binary media for the provenance pane (Range-seek on the video).
- Decision/edit actions reuse: `POST /food-api/inbox/approve`, `…/reject`, `…/unreject`; `PATCH /food-api/recipes/versions/:versionId` (save + compile a draft); `POST /food-api/ingest/retry` (re-run pipeline); `GET /food-api/recipes/:slug?versionNo=<int>` (renderer tab).

Acceptance:

- [x] `getForReview` is the single source of truth for the page; panes never compose their own aggregate query.
- [x] Returns `draft: null` for sources without a `draft_recipe_id`.
- [x] Draft view includes the `rejection` row for archived/rejected versions.
- [x] Save calls `saveDraft` (a recipe-domain action), not an inbox endpoint; on success the page invalidates the `getForReview` query so band / signals / proposed slugs refresh.

## Layout & panes

Responsive grid: a `25 / 45 / 30` three-column split at `lg:` and up; below that, a single stacked column with the **decision pane first** so Approve is above the fold on narrow screens. The provenance pane is wrapped in an error boundary so a malformed `extracted_json` cannot take down the editor or decision panes.

- [x] Three-pane horizontal grid on `lg:`; single stacked column (decision-first) below.
- [x] Breadcrumb: `Inbox / <draft title or #sourceId>` with the Inbox link returning to `/food/inbox`, plus a Close link.
- [x] Provenance error boundary renders a fallback message without blocking the other panes.

### Provenance pane (left)

Dispatches per `kind` and renders a footer (total cost + `extractorVersion`).

- [x] `url-web`: clickable URL + sandboxed `<iframe sandbox="allow-same-origin" referrerPolicy="no-referrer">` preview (or a "no URL" note).
- [x] `url-instagram`: clickable URL + `<video controls>` served from the video endpoint + collapsible caption section.
- [x] `text`: pre-formatted body + copy-to-clipboard button.
- [x] `screenshot`: full-size `<img>` served from the screenshot endpoint.
- [x] Footer shows `totalCostUsd` and `extractorVersion`. (Cost is `0` today — see the ideas file; it depends on the `ai` pillar's telemetry.)

### Editor pane (centre)

Two tabs. Editor mounts the shared `DslEditor` with the draft's `bodyDsl`; Save calls `saveDraft` (compile runs inside the mutation) and toasts the compile result. Renderer lazily fetches `for-rendering` and mounts the read-only `RecipeRenderer` (`variant='detail'`), falling back to a stub when `compileStatus !== 'compiled'`.

- [x] Editor tab embeds `DslEditor` seeded with `bodyDsl`; the editor re-syncs when a refetch returns a different server DSL without clobbering in-flight unsaved edits.
- [x] Save button calls `saveDraft`, disabled while pending or when the body is unchanged; toasts ok / compile-failed.
- [x] Renderer tab mounts the read-only renderer; shows a stub when not compiled.
- [x] Compile-status row shows `compileStatus`, last-compile timestamp, and error count.
- [x] Editor is `readOnly` and the Save button hidden when `draft.status === 'archived'`.

### Decision pane (right)

Top-to-bottom: quality band card, auto-create banner, proposed-slug list, then decision controls.

- [x] **Quality band card** renders the band pill, integer score, and the **full** signal list (not truncated to top-3), each signal with a signed weight.
- [x] **Auto-create banner** lists each ingredient/variant creation (`kind='recipe'` filtered out) with a deep link to `/food/data?focus=<slug>`; hidden when empty. Purely informational — approval is never gated on it.
- [x] **Proposed-slug list** renders each proposed slug + source location; clicking an entry forwards `fromLoc` so the editor moves its cursor to that span (via the editor's `pendingCursor` prop).
- [x] **Approve** is enabled iff `quality.band !== 'blocked' AND compileStatus === 'compiled' AND state !== 'processing'`; a disabled tooltip explains why. The confirmation dialog calls `approve` and navigates to `/food/recipes/<slug>` on success; failure reasons toast inline.
- [x] **Reject** is always enabled; the dialog offers the five reasons (`wrong-recipe`, `low-quality-extraction`, `duplicate`, `not-a-recipe`, `other`); `other` requires a non-empty note (note trimmed before send, server defends with `NoteRequired`/`NoteTooLong`); on success navigates to `/food/inbox?tab=drafts`.
- [x] **Archived variant** (entered from the Rejected tab): a rejection-details panel (reason + full note + `rejectedAt`) plus an **Undo** button calling `unreject`, navigating to `/food/inbox?tab=rejected` on success.
- [x] **Re-run pipeline** button appears for `state === 'partial'` sources, calling `ingest/retry`; disabled with a runbook tooltip when `partialReason === 'auth-dead'`.

## Business rules

- Approve is gated client-side on `band !== 'blocked' && compiled && !processing`; the compiled check is also enforced server-side by `approve` (`NotCompiled`). Reject has no gating beyond a present (and, for `other`, non-empty) reason.
- Polling: `getForReview` refetches every 60s only while `source.state ∈ {pending, processing}`; on-demand once terminal. The Drafts-tab click path lands on already-terminal sources, so polling is reserved for direct-URL navigation during an in-flight ingest.
- Save success invalidates `getForReview` so the decision pane recomputes (e.g. a band shift from `clean` → `attention` after an edit introduces proposed slugs).
- A draft whose recipe row exists can't be orphaned: an FK on `recipes` blocks deleting a recipe while versions exist.

## Edge cases

- [x] Malformed `extracted_json` → the provenance error boundary shows a fallback; editor + decision panes keep working.
- [x] `processing` / archived sources lock editing: the editor is read-only and the Save button is hidden when `draft.status === 'archived'`; Approve is disabled while `source.state === 'processing'`. (A source approved in a sibling tab returns `status='current'`, which the current code does **not** lock — surfacing that read-only state plus an "approved on \<date\>" banner is deferred to [draft-inspector-extensions](../ideas/draft-inspector-extensions.md).)
- [x] `processing` source → Approve disabled; no-draft body shows in the editor pane.
- [x] Save renames the recipe slug → `saveDraft` owns the rename; the URL stays `/food/inbox/:sourceId`; breadcrumb title updates on refetch.

## Tests

- [x] RTL `app/src/pages/inbox/inspector/__tests__/InspectorPage.test.tsx`: not-found, loading, no-draft, approve happy path, Approve disabled when blocked, Approve disabled when uncompiled, reject `other` requires note, archived Undo + read-only editor, partial Re-run (disabled for `auth-dead`), proposed-slug cursor forwarding.

## Out of scope

- Bulk approve/reject from the inspector (Epic 03 no-go).
- Inline editing of auto-created entities (done at `/food/data`).
- Diff of original-extracted-DSL vs current draft; side-by-side source comparison; per-stage re-run (retry is whole-pipeline).
- A "compare to canonical recipe" view when rejecting as `duplicate`.

See [draft-inspector-extensions](../ideas/draft-inspector-extensions.md) for the deferred provenance richness (transcript / keyframes / vision output / JSON-LD / readability / fetched-at), resizable persisted panes, screenshot zoom, per-signal `detail` strings, terminal-state banners, a real per-source cost rollup, and a server-side aggregate test.
