# PRD-135: Per-Draft Inspector

> Epic: [03 — Draft Review & Approval](../../epics/03-draft-review.md)

## Overview

The page that opens when the user clicks an inbox row. A three-pane layout that puts the ingest provenance (URL preview, transcript, vision keyframes, raw LLM output, cost) next to PRD-120's DSL editor next to the approve/reject controls. The user can compare what the pipeline extracted against the source, edit the DSL, re-compile, then approve or reject in one place. Replaces the stub route that PRD-134 ships.

Approval flows through PRD-136's `food.inbox.approve`; rejection through `food.inbox.reject`. The inspector also surfaces PRD-137's quality breakdown so the user understands the band assignment.

For archived versions opened from PRD-138's Rejected tab, the inspector renders read-only with an Undo button instead of approve/reject.

## Route

| Path                    | Page            | Purpose                                                                 |
| ----------------------- | --------------- | ----------------------------------------------------------------------- |
| `/food/inbox/:sourceId` | `InspectorPage` | Three-pane review of a single ingest source and its draft (or no-draft) |

`sourceId` is the `ingest_sources.id`. The page derives the draft `versionId` via the source row (every ingest produces at most one draft; PRD-125's `workerComplete` writes `draft_recipe_id` and the draft version is the most-recent `recipe_versions` row for that recipe with `source_id = :sourceId`).

If the source has no draft (e.g. it's still pending, or it failed and lives in PRD-138's Failed tab), the inspector renders a degraded view (provenance pane + status message; no editor). Failed-tab rows actually navigate to the inspector with the no-draft view, NOT to a separate failed-source page — keeping the entry path uniform.

If `sourceId` doesn't exist, render a 404 with a link back to `/food/inbox`.

## Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Breadcrumb: Inbox / <title or sourceId>                          [Close X] │
├──────────────────┬─────────────────────────────────┬───────────────────────┤
│                  │                                 │                       │
│  Provenance      │  DSL Editor (PRD-120)           │  Decision             │
│                  │                                 │                       │
│  · URL preview   │  · Editor with squiggles        │  · Quality band       │
│  · Transcript    │  · Save button                  │  · Signal breakdown   │
│  · Keyframes     │  · Compile output / errors      │  · Auto-create banner │
│  · Raw LLM JSON  │                                 │                       │
│  · Stages meta   │  Toggle: Editor ↔ Renderer      │  [ Approve ]          │
│  · Cost          │  (PRD-121 read-only view)       │  [ Reject ]           │
│                  │                                 │                       │
└──────────────────┴─────────────────────────────────┴───────────────────────┘
```

Three resizable panes via a horizontal split layout. Default widths: 25% / 45% / 30%. State persists per-user via `localStorage`.

On screens < 1024px wide, panes stack vertically: Decision → Editor → Provenance (decision first so Approve is always above the fold).

### Provenance pane (left)

Renders per `ingestKind`:

- **`url-web`**: clickable URL; `<iframe sandbox="allow-same-origin">` preview; "Source viewed at <fetched-at>" timestamp; JSON-LD raw output (collapsed by default) if PRD-127 found it; readability HTML excerpt (collapsed) if PRD-128 was the path.
- **`url-instagram`**: clickable URL; embedded `<video>` of the saved reel (served via the screenshot endpoint extended to videos — see "Cross-PRD dependencies"); collapsible sections for caption text, STT transcript (with timestamps clickable to seek the video), keyframe gallery (click to open full-size), vision LLM raw output.
- **`text`**: pasted text in a `<pre>` block; copy-button.
- **`screenshot`**: full-size image with zoom-on-click; vision LLM raw output.

Always-visible footer of the pane: total ingest cost in USD (sum of `ai_inference_log` rows for this `source_id`); pipeline `extractor_version` from PRD-125's meta; ingest age.

### Editor pane (center)

A tab strip at the top of the pane:

- **Editor** (default) — mounts PRD-120's `DslEditor` with the draft's `body_dsl`. Full editor features per PRD-120: autocomplete, squiggles, chip rendering. Save button calls `food.recipes.saveDraft` (PRD-119) which compiles and returns the result. Errors flow back into the editor.
- **Renderer** — mounts PRD-121's read-only renderer (`variant='detail'`) using the most recent compiled state. If `compile_status !== 'compiled'`, the tab shows a stub: "Renderer unavailable — fix compile errors first" with a link back to the Editor tab.

Below the tab strip, an inline status row shows `compile_status` + last-compile timestamp + error count.

For archived versions (Rejected-tab entry), the editor is read-only (`readOnly: true` on PRD-120's editor) and the Save button hides.

### Decision pane (right)

Top-to-bottom:

1. **Quality band card** — PRD-137's band pill (large), score, and the full signal list (not just top 3 like the inbox row). Each signal shows its weight and `detail` string.
2. **Auto-create banner** — listed iff `creations` exist for this version (queried via PRD-115's flow + the materialised state in PRD-116). Each row: created entity (ingredient or variant), proposed slug, default unit, link to `/food/data?focus=<slug>` (PRD-122). Banner is dismissible per-session but always re-appears on reload (it's not state worth persisting).
3. **Proposed-slug list** — PRD-119's `food.recipes.listProposedSlugs(versionId)` output rendered as a list with severity icons. Click navigates the editor's cursor to the `fromLoc` so the user can fix it.
4. **Decision controls** — for pending drafts:
   - **Approve** button. Enabled iff `qualityBand !== 'blocked' AND compile_status = 'compiled'`. Disabled tooltip explains why if not enabled. Clicking opens a small confirmation dialog ("Approve this draft? It will become the current version of `<slug>`.") with [Cancel] [Approve]. On confirm: calls `food.inbox.approve({ versionId })` (PRD-136). On success: toast + navigate to `/food/recipes/<slug>`. On error: shows the error code inline.
   - **Reject** button. Always enabled. Clicking opens a reject dialog:

     ```
     Reject this draft?
     [Reason ▼] wrong-recipe / low-quality-extraction / duplicate / not-a-recipe / other
     [Note (optional, required if reason=other)] ___________
     [Cancel] [Reject]
     ```

     On confirm: calls `food.inbox.reject({ versionId, reason, note })` (PRD-136). On success: toast + navigate to `/food/inbox?tab=drafts`. On error: inline error display.

5. **Archived-version variant** (when entered from Rejected tab): the Decision controls are replaced by an **Undo** button that calls `food.inbox.unreject({ versionId })` and on success navigates back to `/food/inbox?tab=rejected`.

## Data

```ts
// apps/pops-api/src/modules/food/inbox-router.ts (extends what PRDs 136/134/138 created)
food.inbox.getForReview: query({
  input: { sourceId: number },
  output: ReviewView,
});

export type ReviewView = {
  /* Source */
  source: {
    id: number;
    kind: 'url-web' | 'url-instagram' | 'text' | 'screenshot';
    url: string | null;
    caption: string | null;          // for text kind
    ingestedAt: string;
    extractorVersion: string;
    state: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
    partialReason?: PartialReason;
    reviewedAt: string | null;
    meta: IngestMeta;                // the full PRD-125 stages JSON; used by the provenance pane
    inferenceLogs: AiInferenceLogEntry[];   // PRD-133 rows for this source; cost rollup
  };
  /* Draft (null when no draft was produced) */
  draft: {
    versionId: number;
    versionNo: number;
    recipeSlug: string;
    recipeArchivedAt: string | null;
    status: 'draft' | 'current' | 'archived';
    title: string | null;
    bodyDsl: string;
    compileStatus: 'uncompiled' | 'compiled' | 'failed';
    compileError: string | null;
    compiledAt: string | null;
    rejection: { reason: string; note: string | null; rejectedAt: string } | null;
    proposedSlugs: ProposedSlugRow[];      // PRD-119's listProposedSlugs output
    creations: ResolverCreationRow[];      // PRD-115's creations, persisted via PRD-116
    quality: QualityResult;                // PRD-137
  } | null;
};

export type ResolverCreationRow = {
  kind: 'ingredient' | 'variant';
  slug: string;
  parentIngredientSlug: string | null;     // null for kind='ingredient'
  defaultUnit: 'g' | 'ml' | 'count';
  createdAt: string;
};
```

The query is one round-trip. Internally it composes:

- `ingest_sources` row + JSON-decoded `extracted_json` (PRD-110).
- `ai_inference_log` rows by `source_id` (PRD-133).
- `recipe_versions` row + parent `recipes.archived_at` (PRD-107).
- `recipe_version_rejections` row if any (PRD-136).
- PRD-119's `food.recipes.listProposedSlugs(versionId)` reuse.
- `ResolverCreationRow[]` queried from the audit surface PRD-116 provides (or, if PRD-116 doesn't already expose this directly, this PRD amends PRD-116's section "Materialiser creations" to add a `listCreationsForVersion(versionId)` helper — see "Cross-PRD dependencies").
- `QualityResult` via PRD-137's `gatherQualityInputs(versionId, db)` + `scoreDraft`.

`ResolverCreationRow` is derived data, not a denormalised table; PRD-115's resolver creations are persisted via PRD-116's materialisation. The helper rebuilds the list by diffing the `slug_registry.created_at` for entities introduced by this version's compile.

## Components

```
packages/app-food/src/pages/inbox/inspector/
├── InspectorPage.tsx           // top-level; mounts panes; handles loading / 404
├── ProvenancePane.tsx          // dispatches to per-kind body component
├── ProvenanceUrlWeb.tsx
├── ProvenanceUrlInstagram.tsx
├── ProvenanceText.tsx
├── ProvenanceScreenshot.tsx
├── EditorPane.tsx              // wraps PRD-120's DslEditor + Renderer tab + Save
├── DecisionPane.tsx
├── QualityBandCard.tsx         // band pill + score + signals list
├── AutoCreateBanner.tsx        // links to /food/data
├── ApproveDialog.tsx           // confirmation modal
├── RejectDialog.tsx            // reason picker + note
└── UndoButton.tsx              // for archived view
```

## Business Rules

- `food.inbox.getForReview` is the single source of truth for the inspector. The page never composes its own queries.
- Save (in the editor pane) calls `food.recipes.saveDraft` directly (PRD-119) — NOT through `food.inbox.*`. Saving is a recipe-domain action; only approve / reject are inbox-domain actions. On save success, the inspector invalidates the `getForReview` cache so the band / quality breakdown / proposed slugs refresh.
- Approve is gated on `qualityBand !== 'blocked' AND compile_status = 'compiled'`. The first condition is purely UX safety; the second is enforced server-side by PRD-136's `NotCompiled` check.
- Reject has no gating beyond a present reason. A blocked / uncompiled / empty draft can be rejected.
- For archived versions opened via the Rejected tab, the editor is read-only and approve/reject buttons are replaced by Undo.
- The decision pane's auto-create banner is purely informational — approval is never gated on resolving auto-creations (Epic 03 Key Decision).
- Clicking a proposed-slug entry in the Decision pane moves the editor cursor to the `fromLoc.start` position (PRD-120 already exposes a `moveCursor()` imperative handle; this PRD calls it).
- When entered from PRD-138's Failed tab, the inspector renders the degraded view (no editor; provenance only). Retry button is mirrored from the Failed tab so the user can retry from the inspector without going back.
- Polling: `getForReview` refetches every 60s ONLY while the source state is `pending` or `processing`. Once terminal, refetch is on-demand.

## Edge Cases

| Case                                                                                                                        | Behaviour                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User opens the inspector for a source whose draft was approved in another tab                                               | `getForReview` returns the draft with `status='current'` and `reviewedAt` set. Inspector banner: "This draft was approved on <date>." Editor read-only; no approve/reject. |
| User edits and saves, then clicks Approve before compile completes                                                          | `saveDraft` is synchronous (compile happens inside the mutation). Approve button is disabled during the save's pending state.                                              |
| User edits, saves, save fails compile, user clicks Approve                                                                  | Button is disabled (compile_status !== 'compiled'). Tooltip: "Fix compile errors first."                                                                                   |
| User clicks Approve, dialog opens, user closes browser tab                                                                  | No mutation fires. Source stays unreviewed.                                                                                                                                |
| User clicks Reject with reason=other and empty note                                                                         | Dialog's Reject button is disabled until note is non-empty for `other`. Server defends with `NoteRequired`.                                                                |
| User clicks Reject, mutation succeeds, user navigates back, then clicks Undo                                                | Inspector reloads with archived view + Undo. PRD-136's unreject flips back to draft.                                                                                       |
| `sourceId` resolves to a source whose recipe was deleted                                                                    | FK on `recipes` prevents deletion while versions exist; can't arise.                                                                                                       |
| Provenance pane crashes (e.g. malformed JSON in `extracted_json`)                                                           | Error boundary in `ProvenancePane` shows "Source meta couldn't be loaded" without blocking the editor and decision panes.                                                  |
| User opens inspector for a `pending` source                                                                                 | Editor pane shows "Worker is still processing this ingest. Reload to check again." Approve/Reject buttons are disabled.                                                    |
| User reaches inspector via direct URL but is not in the inbox flow (e.g. shared link)                                       | Page works standalone; the Close button navigates to `/food/inbox`.                                                                                                        |
| Keyframe gallery is 8 images of 2 MB each                                                                                   | Lazy-loaded with `loading="lazy"`. Initial render uses tiny thumbnails (~150px wide; PRD-130 specifies; if not specified, this PRD amends PRD-130 to produce them).        |
| User saves with a DSL that renames the recipe slug                                                                          | PRD-119's `saveDraft` handles the rename (its rules). Inspector URL stays `/food/inbox/:sourceId`; recipe slug shown in breadcrumb updates.                                |
| User opens inspector then refreshes after the source was approved                                                           | Behaviour from row 1 above; inspector shows the "approved" read-only state.                                                                                                |
| User opens inspector for a source whose IG video file was rotated out of storage (PRD-110 FIFO)                             | ProvenanceUrlInstagram renders without the `<video>`: "Source media no longer available (rotated out). Caption + transcript preserved."                                    |
| Quality band changes mid-session (band was `clean`, user saves a change that introduces 4 proposed slugs → now `attention`) | Save completes; `getForReview` refetches; band card updates; signals recompute. No special UI animation in v1.                                                             |

## Acceptance Criteria

Inline per theme protocol.

### Route & shell

- [ ] `/food/inbox/:sourceId` is registered in `packages/app-food/src/routes.tsx`.
- [ ] Page renders a 404 for unknown `sourceId`.
- [ ] Breadcrumb shows "Inbox / <title or sourceId>" with the Inbox link going back to `/food/inbox` preserving the prior tab.
- [ ] Layout panes are resizable with persisted widths in `localStorage`.
- [ ] On screens < 1024px, panes stack vertically with the decision pane first.

### Provenance pane

- [ ] Per-kind component renders for each of `url-web`, `url-instagram`, `text`, `screenshot`.
- [ ] URL kinds render a sandboxed iframe.
- [ ] Instagram kind renders the saved video (when present) plus collapsible caption / transcript / keyframes / vision-output sections.
- [ ] Screenshot kind renders the image with zoom-on-click.
- [ ] Text kind renders pre-formatted text + copy-button.
- [ ] Footer shows total cost in USD (sum from `ai_inference_log` rows) and `extractor_version`.

### Editor pane

- [ ] Editor tab embeds PRD-120's `DslEditor` with the draft's `body_dsl`.
- [ ] Save button calls `food.recipes.saveDraft` and shows compile result.
- [ ] Renderer tab embeds PRD-121's read-only renderer; falls back when `compile_status !== 'compiled'`.
- [ ] Status row shows `compile_status` + last-compile timestamp + error count.
- [ ] Editor is read-only (and Save button hidden) when `draft.status === 'archived'`.

### Decision pane

- [ ] Quality band card uses PRD-137's `band` and renders the full signal list (not truncated).
- [ ] Auto-create banner lists each `ResolverCreationRow` with a deep link to `/food/data?focus=<slug>` (PRD-122).
- [ ] Proposed-slug list renders PRD-119's `listProposedSlugs` output; clicking an entry moves the editor cursor.
- [ ] Approve button is enabled iff `qualityBand !== 'blocked' AND compile_status = 'compiled'`; disabled tooltip explains.
- [ ] Approve confirmation dialog calls `food.inbox.approve` and navigates to `/food/recipes/<slug>` on success.
- [ ] Reject dialog requires a reason; if reason=`other`, requires a note; calls `food.inbox.reject` and navigates to `/food/inbox?tab=drafts` on success.
- [ ] Archived-version entry shows Undo only (calling `food.inbox.unreject`) and navigates back to `/food/inbox?tab=rejected`.

### Data

- [ ] `food.inbox.getForReview` lives alongside the other inbox router endpoints and returns `ReviewView`.
- [ ] Polling refetches every 60s ONLY while `source.state ∈ {pending, processing}`.
- [ ] Save success invalidates the `getForReview` cache so the decision pane refreshes.

### Tests

- [ ] Vitest integration at `apps/pops-api/src/modules/food/__tests__/inbox-inspector.test.ts`:
  - `getForReview` returns the full shape for each ingest kind.
  - Returns `draft: null` for sources without a draft.
  - Includes `rejection` row for archived + rejected versions.
- [ ] Vitest + RTL at `packages/app-food/src/pages/inbox/inspector/__tests__/InspectorPage.test.tsx`:
  - Approve happy path navigates and toasts.
  - Approve disabled when blocked / uncompiled; tooltip surfaces.
  - Reject flow with all five reasons; `other` requires a note.
  - Undo flow for archived-rejected version.
  - Read-only editor for archived versions.
  - Save → re-fetch → updated quality band.
- [ ] Vitest test for the cursor-move behaviour when clicking a proposed-slug entry (calls PRD-120's `moveCursor`).

## Out of Scope

- Bulk approve / reject from the inspector — explicit no-go (Epic 03).
- Inline editing of auto-created entities (rename slug, set default unit) — refinement happens at `/food/data` (PRD-122).
- Diff view between the original ingest's extracted DSL and the current draft (post-edit) — out of scope; the editor's own history covers undo within a session.
- Comparing two ingest sources side-by-side (e.g. to spot duplicates) — out of scope.
- Per-stage re-run (re-run STT only; re-run vision only) — out of scope; retry is whole-pipeline (PRD-125).
- Recording approval / rejection notes beyond the reject reason field — single-user.
- A "compare to canonical recipe" view when rejecting as `duplicate` — out of scope; user opens the canonical recipe in another tab manually.
- Audio playback controls for the Instagram transcript beyond click-to-seek — out of scope.
- Editing inside the renderer tab — explicitly read-only.

## Requires (cross-PRD dependencies)

- **PRD-107** — `recipe_versions` columns.
- **PRD-110** — `ingest_sources` columns and `${FOOD_INGEST_DIR}` filesystem layout.
- **PRD-115** — `proposed_slugs` + `creations` semantics.
- **PRD-116** — compile state; the `listCreationsForVersion(versionId)` helper (small amendment to PRD-116 — its Materialiser section currently writes creations but doesn't expose a read query; this PRD requires one).
- **PRD-119** — `saveDraft`, `listProposedSlugs`, `food.recipes.create` semantics; the editor / renderer mounting patterns mirror it.
- **PRD-120** — `DslEditor` component with `readOnly`, `moveCursor`, and the unified `issues` shape.
- **PRD-121** — `RecipeRenderer variant='detail'`.
- **PRD-122** — `/food/data?focus=<slug>` deep-link route.
- **PRD-125** — `IngestMeta`, `PartialReason`, `IngestStatus.state`. PRD-138's screenshot endpoint extension applies here too; this PRD adds the corresponding amendment for serving the IG video file (path `${FOOD_INGEST_DIR}/<sourceId>/video.mp4`) — `GET /api/food/ingest/source/:sourceId/video` returns `video/mp4` or 404. Combined with PRD-138's screenshot endpoint, both extensions live on PRD-125.
- **PRD-130** — STT transcript JSON and keyframe file layout. This PRD requires PRD-130 to produce a small `thumb-<n>.webp` per keyframe in addition to the full-size; amendment noted on PRD-130 (see "Cross-PRD dependencies").
- **PRD-133** — `ai_inference_log` rows for cost rollup.
- **PRD-136** — `food.inbox.approve` / `reject` / `unreject` mutations.
- **PRD-137** — `scoreDraft` + `QualityResult`.
