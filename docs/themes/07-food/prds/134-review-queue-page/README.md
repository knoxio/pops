# PRD-134: Review Queue Page

> Epic: [03 — Draft Review & Approval](../../epics/03-draft-review.md)

## Overview

The `/food/inbox` page itself: the tab shell (Drafts / Rejected / Failed ingests), the filter container, the Drafts tab content with heuristic-sorted rows, and the row component that's the entry point to PRD-135's inspector. This PRD owns the layout and the default tab; PRD-138 owns the other two tabs' content.

After this PRD, the user can land on `/food/inbox`, see every pending ingest-originated draft ranked by quality, filter by ingest kind / partial reason / heuristic band, paginate, and click a row to open the inspector.

The page is wired up but inert without PRD-135 — clicking a row navigates to an inspector route that doesn't exist yet. PRD-134 ships with a stub inspector route showing "Inspector coming in PRD-135" so the flow is integration-testable.

## Routes

| Path                       | Page        | Purpose                                 |
| -------------------------- | ----------- | --------------------------------------- |
| `/food/inbox`              | `InboxPage` | Tab shell + default tab (`?tab=drafts`) |
| `/food/inbox?tab=drafts`   | `InboxPage` | Drafts tab (this PRD's content)         |
| `/food/inbox?tab=rejected` | `InboxPage` | Rejected tab (PRD-138 content)          |
| `/food/inbox?tab=failed`   | `InboxPage` | Failed tab (PRD-138 content)            |

Tab state lives in the URL `?tab=` query param so refreshes and shared URLs preserve context. Filter state is encoded in the URL hash (`#filters=...`) to keep the address bar readable.

Default tab when `?tab` is absent: `drafts`.

Module registration: PRD-118's `app-food` manifest gains a new route entry for `/food/inbox` pointing at `InboxPage`. Sidebar gains an "Inbox" link with a badge showing `food.inbox.pendingCount()` (see API below). Badge updates on a 60s React Query interval.

## Drafts tab — content

### Row data

The row consumes one of these per draft:

```ts
export type InboxDraftRow = {
  /* Identity */
  sourceId: number;
  versionId: number;
  recipeSlug: string;

  /* Display */
  title: string | null; // null = "<no title>"
  recipeType:
    | 'plate'
    | 'component'
    | 'technique'
    | 'sauce'
    | 'dressing'
    | 'drink'
    | 'condiment'
    | null;
  ingestKind: 'url-web' | 'url-instagram' | 'text' | 'screenshot';
  sourceUrl: string | null; // null for text / screenshot
  ingestedAt: string; // ISO

  /* Quality */
  qualityBand: 'clean' | 'minor' | 'attention' | 'blocked';
  qualityScore: number; // 0-100
  topSignals: QualitySignal[]; // first 3 from PRD-137; for the row tooltip
  partialReason?: PartialReason; // PRD-125

  /* Counts (badges) */
  proposedSlugCount: number;
  creationCount: number;
  compileStatus: 'uncompiled' | 'compiled' | 'failed';
};
```

### Row layout (left → right)

```
┌─────────────────────────────────────────────────────────────────────┐
│ [BAND] Title (or <no title>)                          [Kind] · 3h   │
│        recipe-slug · 3 props · 2 created · compiled                  │
│        ⚠ caption-only-fallback                                       │
└─────────────────────────────────────────────────────────────────────┘
```

- **`[BAND]`** — a coloured pill: green (`clean`), amber (`minor`), orange (`attention`), red (`blocked`). Hover shows the top 3 signals as a tooltip.
- **Title** — `recipe_versions.title` or `<no title>` if empty.
- **`[Kind]`** — chip with the ingest kind (web / IG / text / screenshot). Click navigates to the source URL in a new tab (web / IG) or opens PRD-138's ViewSourceDialog (text / screenshot) inline without leaving the inbox.
- **Ingest age** — relative ("3h", "2d", "3w") with full timestamp in title attribute.
- **Sub-line** — slug · proposedSlugs count · creations count · compile_status, separated by `·`. Each count is only rendered if > 0.
- **PartialReason banner** (only if present) — yellow inline strip beneath the sub-line with the reason text.

Click the row anywhere except the kind chip → navigates to `/food/inbox/:sourceId` (PRD-135).

### Filters

Filter chips above the list. All multi-select except the date range. State syncs to URL hash.

- **Quality band**: `clean` · `minor` · `attention` · `blocked` (default: all four selected).
- **Ingest kind**: web · IG · text · screenshot.
- **Partial reason**: lists every value seen in the current result set (chip is hidden if no rows have any partial reason).
- **Show fresh only** (toggle): when on, restricts to `ingestAgeMinutes < 1440` (24h).
- **Sort**: dropdown with `quality (default)`, `oldest first`, `newest first`.

`quality` sort: ascending score (worst first by default — those are the ones needing attention). Tie-break: `ingested_at DESC`. The reasoning is that the user wants to triage the worst stuff first; a flipped toggle ("sort by quality desc") inverts it so cleanest-first is also one click away.

`oldest first` / `newest first` sort by `ingested_at` only.

### Empty states

- No drafts at all (filters cleared): "Inbox is empty. Paste a recipe URL into the ingest dialog (PRD-125) to populate it."
- No drafts after applying filters: "No drafts match your filters." with a "Clear filters" link.

### Pagination

Cursor-based, `limit=20`, React Query infinite scroll (matches PRD-119's pattern).

## API

```ts
// apps/pops-api/src/modules/food/inbox-router.ts (extends the file PRD-136 creates)
food.inbox.list: query({
  input: {
    bands?: Array<'clean' | 'minor' | 'attention' | 'blocked'>,
    kinds?: Array<'url-web' | 'url-instagram' | 'text' | 'screenshot'>,
    partialReasons?: PartialReason[],
    freshOnly?: boolean,                  // < 24h
    sort?: 'quality-asc' | 'quality-desc' | 'oldest' | 'newest',
    cursor?: string,
    limit?: number,
  },
  output: { items: InboxDraftRow[], nextCursor?: string },
});

food.inbox.pendingCount: query({
  input: {},
  output: { count: number },
});
```

### `list` server-side flow

1. SELECT `recipe_versions` JOIN `ingest_sources` ON `source_id = ingest_sources.id` JOIN `recipes` ON `recipe_id = recipes.id` WHERE:
   - `recipe_versions.status = 'draft'`
   - `recipe_versions.source_id IS NOT NULL`
   - `ingest_sources.reviewed_at IS NULL` (per PRD-136 — approved sources stay out of the queue)
   - `recipes.archived_at IS NULL` (defensive — don't surface drafts whose parent is archived)
   - Optional kind / partialReason filters applied to ingest_sources.
2. Compute `QualityInputs` for each row using PRD-137's `gatherQualityInputsForVersions` batched helper.
3. Score each via PRD-137's `scoreDraft`.
4. Apply `bands` filter and `freshOnly` filter in memory (the score isn't a column; can't push it down to SQL).
5. Sort by the requested order; apply cursor + limit.
6. Return rows.

In-memory band filtering means the SQL fetch is wider than the displayed result. Mitigation: SQL filters trim by `kind` / `partialReason` first; only the band filter is in-memory. Volume is low (single-user; hundreds of drafts max); a full table scan is cheap.

### `pendingCount` server-side flow

`SELECT COUNT(*)` over the same JOIN + WHERE as `list` but with no filters. Used by the sidebar badge.

### `cursor` shape

Opaque base64 of `{ score, ingestedAt, versionId }` (the sort triplet, tie-broken on `versionId`). Frontend doesn't introspect.

## Components

```
packages/app-food/src/pages/inbox/
├── InboxPage.tsx           // top-level; reads ?tab; mounts InboxLayout + active tab
├── InboxLayout.tsx         // tab strip; filter container slot; pendingCount badge
├── DraftsTab.tsx           // this PRD; lists InboxDraftRow rows
├── DraftRow.tsx            // this PRD; single row with band pill, title, sub-line
├── InboxFilters.tsx        // this PRD; chips + sort dropdown; URL-hash-backed state
├── QualityBandBadge.tsx    // this PRD; coloured pill with signal tooltip
├── EmptyState.tsx          // shared by all three tabs; PRD-134 owns
└── routes.tsx              // module manifest route entry; PRD-118 amendment
```

PRD-138's `RejectedTab.tsx` and `FailedTab.tsx` plug into the layout's tab slot. Filter container is tab-specific (each tab passes its own filter component); only the tab strip is shared.

## Business Rules

- The Drafts tab queries ONLY ingest-originated drafts that are still pending (`source_id IS NOT NULL AND reviewed_at IS NULL`). Manually-authored drafts and approved drafts stay out, by design.
- `qualityBand` is computed every time; never cached on the row. PRD-137 enforces this.
- `partialReason` from `ingest_sources.extracted_json` is only surfaced if the row would otherwise look "fine" on the surface — but it's always part of the heuristic input. Banner shows for clarity; heuristic accounts for it via the rubric.
- Default filter state = all bands selected, all kinds selected, no partial reasons selected (i.e. don't filter on partial reason), `freshOnly=false`, sort=`quality-asc`.
- The "quality-asc" sort defaults to **worst first** because that's the triage workflow. Users who want to clear easy wins first can toggle to "quality-desc".
- Filters reset on tab change. Each tab has its own URL hash; switching from `?tab=drafts#filters=...` to `?tab=rejected` drops the Drafts filters; switching back reloads them iff still in the browser history.
- Clicking the kind chip opens the source (URL in new tab, or ViewSourceDialog for text/screenshot) WITHOUT navigating to the inspector. This lets the user peek before deciding to invest time.
- Polling: the Drafts tab refetches `list` every 60s while open (React Query `refetchInterval`) so newly-completed ingests appear without a manual refresh. Background polling stops when the tab is hidden.

## Edge Cases

| Case                                                                                          | Behaviour                                                                                                                       |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| User opens `/food/inbox` with an invalid `?tab` value                                         | Falls back to `drafts`; URL is normalised to `?tab=drafts` via `router.replace`.                                                |
| 500 drafts all in `blocked` band                                                              | List paginates 20 at a time; user can scroll. The sidebar badge shows "500"; counter caps display at "99+".                     |
| A draft transitions to compiled while the user has the inbox open                             | Next 60s poll refreshes the row; its band changes (`attention` → `clean` perhaps). Score-sort may reorder the row's position.   |
| User clears all band filters                                                                  | Empty result set (no rows match nothing). Empty state with "Clear filters" link covers it.                                      |
| Filter URL hash gets very long (~30 chips)                                                    | URLs over 2000 chars are uncommon but possible. Browser handles it; no truncation needed.                                       |
| `food.inbox.list` returns rows where `qualityBand` doesn't match the requested `bands` filter | Cannot happen — server filters by band in-memory before pagination. Test pins this.                                             |
| User clicks a row, inspector page fails to load (PRD-135 not yet shipped or 500)              | The stub inspector route shipped with this PRD renders "Inspector coming in PRD-135"; once PRD-135 ships, the stub is replaced. |
| User has Drafts tab open in two tabs; approves a draft in one                                 | The other tab's 60s poll refreshes; the approved row disappears.                                                                |
| Quality score ties across two rows with identical `ingested_at`                               | Tie-break on `versionId DESC` (covered by the cursor shape).                                                                    |
| Sidebar badge shows "12" but `food.inbox.list` returns 11 after band filter applied           | Expected — badge counts unreviewed pending drafts, filters narrow further. No mismatch indication needed.                       |
| User on mobile (375px)                                                                        | Row layout collapses: band pill + title on row 1; everything else on row 2 wrapping. Filter chips wrap to multiple lines.       |
| User triggers a sort change                                                                   | Cursor is reset on sort change; React Query refetches from the top. Scroll position resets to top.                              |
| `gatherQualityInputsForVersions` is slow for 500 versions                                     | Single batched SQL; sub-100ms expected for low thousands. If observed slow, add a denormalised count column (deferred).         |

## Acceptance Criteria

Inline per theme protocol.

### Routes & shell

- [ ] `/food/inbox` is registered in PRD-118's `app-food` manifest with both the page and the sidebar entry.
- [ ] Sidebar entry shows a badge with `food.inbox.pendingCount` value; ">99" caps at "99+".
- [ ] `InboxPage` reads `?tab` and renders the active tab. Default `tab=drafts`.
- [ ] Tab strip allows switching; URL updates via `router.push` (back-nav restores prior tab).
- [ ] A stub inspector route `/food/inbox/:sourceId` renders "Inspector coming in PRD-135" (replaced by PRD-135).

### Drafts tab

- [ ] `food.inbox.list` lives in `apps/pops-api/src/modules/food/inbox-router.ts` (alongside PRD-136's mutations).
- [ ] `DraftsTab` renders rows for the current page; React Query infinite scroll triggers cursor pagination.
- [ ] Each row renders the band pill (PRD-137 colours), title (or `<no title>`), kind chip, ingest age, sub-line counts, partialReason banner.
- [ ] Hovering the band pill shows the top 3 signals from PRD-137.
- [ ] Clicking the kind chip opens the source per the per-kind rules above (NOT the inspector).
- [ ] Clicking elsewhere on the row navigates to `/food/inbox/:sourceId`.
- [ ] Clicking the kind chip for `text` or `screenshot` rows opens PRD-138's `ViewSourceDialog` inline (no navigation); for `url-*` rows the chip opens the URL in a new tab.
- [ ] React Query `refetchInterval: 60_000` while the page is visible.

### Filters

- [ ] Quality band, ingest kind, partial reason chips behave as multi-select.
- [ ] Fresh-only toggle applies the `< 24h` filter.
- [ ] Sort dropdown supports the four documented orders.
- [ ] Filter state syncs to URL hash; refresh restores it.
- [ ] "Clear filters" link in the empty state resets the URL hash.

### Server

- [ ] `list` query implements the documented SQL JOIN + WHERE + heuristic-filter + sort.
- [ ] `pendingCount` returns the total of pending ingest-originated drafts (no filter).
- [ ] `gatherQualityInputsForVersions` (PRD-137) is invoked exactly once per `list` call.
- [ ] Vitest integration test asserts a seeded set of 10 drafts (mix of bands) returns the expected order under each sort.
- [ ] Vitest integration test asserts approved sources (`reviewed_at IS NOT NULL`) are excluded.
- [ ] Vitest integration test asserts archived recipes' drafts are excluded.

### UI tests

- [ ] Vitest + RTL suite at `packages/app-food/src/pages/inbox/__tests__/DraftsTab.test.tsx` covers row rendering, filter interactions, sort switch, empty state.
- [ ] Vitest + RTL suite for `InboxLayout.test.tsx` covers tab switching and badge rendering.
- [ ] Mobile (375px) test asserts the row layout collapses without horizontal scroll.

## Out of Scope

- The inspector itself — **PRD-135**.
- Rejected / Failed tab content — **PRD-138** (this PRD owns the shell that hosts them).
- Bulk actions — explicit no-go per Epic 03's Key Decisions.
- Sorting by individual signals (e.g. "all drafts with PROPOSED_SLUGS_MANY") — out of scope; filter by band as a proxy.
- Saved filter presets — out of scope.
- Per-row inline approve / reject buttons — explicit no-go (forces inspector engagement before approving).
- Search box (free-text over titles or slugs) — deferred to a follow-up if real volume justifies it.
- Per-source ingest cost shown on the row — too noisy; shown in the inspector (PRD-135) instead.
- WebSocket / SSE push to update rows in real time — 60s polling is sufficient for v1.

## Requires (cross-PRD dependencies)

- **PRD-107** — `recipe_versions` columns (`source_id`, `status`, `compile_status`).
- **PRD-110** — `ingest_sources.reviewed_at` (extension by PRD-136) and `extracted_json`.
- **PRD-116** — `recipe_version_proposed_slugs` table for the proposed-slug count on the row sub-line.
- **PRD-118** — `app-food` manifest route registration.
- **PRD-125** — `PartialReason` enum.
- **PRD-136** — `food.inbox` router file (this PRD adds queries to it) and `reviewed_at` semantics.
- **PRD-137** — `scoreDraft` and `gatherQualityInputsForVersions`.
- **PRD-138** — supplies `RejectedTab` and `FailedTab` plugged into `InboxLayout`'s tab slot.
