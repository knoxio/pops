# Review Queue Page

Status: Partial — page, Drafts tab, filters, and both REST endpoints are shipped. Two pieces are deferred to ideas: the sidebar pending-count badge (`ideas/inbox-sidebar-badge.md`) and frontend cursor/infinite-scroll pagination (`ideas/inbox-infinite-scroll.md`).

## Purpose

`/food/inbox` is the triage surface for ingest-originated recipe drafts. A user lands on it, sees every pending draft ranked worst-first by a quality heuristic, filters by band / ingest kind / partial reason / freshness, and clicks a row to open the inspector (`/food/inbox/:sourceId`). The page is a tab shell — Drafts (this page's default), Rejected, and Failed — with the Rejected/Failed tab bodies plugged in alongside.

## Routes

| Path                       | Page            | Purpose                        |
| -------------------------- | --------------- | ------------------------------ |
| `/food/inbox`              | `InboxPage`     | Tab shell + default Drafts tab |
| `/food/inbox?tab=drafts`   | `InboxPage`     | Drafts tab (this page)         |
| `/food/inbox?tab=rejected` | `InboxPage`     | Rejected tab                   |
| `/food/inbox?tab=failed`   | `InboxPage`     | Failed tab                     |
| `/food/inbox/:sourceId`    | `InspectorPage` | Per-draft inspector            |

Active tab lives in the `?tab=` query param so refresh + shared links preserve context (default `drafts` when absent or invalid). Drafts-tab filter state lives in the URL hash (`#filters=<base64url(json)>`), defaults dropped so a pristine URL stays clean. Switching tabs drops the Drafts hash; back-nav restores it from history.

The Inbox nav entry (`icon: Bell`) is registered in the food app route manifest.

## Data model (row wire shape)

`POST /inbox/list` returns `{ items: InboxDraftRow[], nextCursor: string | null }` where each row is:

```ts
type InboxDraftRow = {
  sourceId: number;
  versionId: number;
  recipeSlug: string;
  title: string | null; // null = "<no title>" (empty/whitespace title)
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
  qualityBand: 'clean' | 'minor' | 'attention' | 'blocked';
  qualityScore: number; // 0–100
  topSignals: { code: string; weight: number; detail?: string }[]; // first 3, for the band tooltip
  partialReason?:
    | 'auth-dead'
    | 'rate-limited'
    | 'stt-failed'
    | 'vision-failed'
    | 'caption-only-fallback'
    | 'empty-extraction';
  proposedSlugCount: number;
  creationCount: number;
  compileStatus: 'uncompiled' | 'compiled' | 'failed';
};
```

`qualityBand`/`qualityScore`/`topSignals` are derived per row from the deterministic scoring function (score starts at 100, signal weights subtract); never persisted on the row.

## REST API surface

- `POST /inbox/list` — body `{ bands?, kinds?, partialReasons?, freshOnly?, sort?, cursor?, limit? }` (limit ≤ 100, default 20; `sort` ∈ `quality-asc | quality-desc | oldest | newest`); returns the page above.
- `GET /inbox/pending-count` — `{ count: number }`, the unfiltered queue depth.

### `list` server flow

1. SELECT `recipe_versions` ⨝ `ingest_sources` (on `source_id`) ⨝ `recipes` (on `recipe_id`) WHERE `recipe_versions.status = 'draft'` AND `ingest_sources.reviewed_at IS NULL` AND `recipes.archived_at IS NULL`; the `kinds` filter is pushed into SQL (`IN`), nothing else.
2. Batch-gather quality inputs for all returned versions in one round-trip (no N+1).
3. Score each row; apply `bands`, `partialReasons`, and `freshOnly` (`ingestAgeMinutes < 1440`) in memory, since the score is not a column.
4. Sort, then cursor-slice + limit.

Wider-than-displayed SQL fetch is acceptable: single-user, hundreds of drafts max, O(N) in-memory pass is cheap.

### Sort + cursor

- `quality-asc` (default): score ascending = **worst first** (the triage order); tie-break `ingested_at DESC`, then `versionId DESC`.
- `quality-desc`: score descending (cleanest first), same tie-break.
- `oldest`/`newest`: by `ingested_at` only; `oldest` tie-breaks `versionId ASC`, `newest` `versionId DESC`.
- Cursor is opaque base64 of `{ score, ingestedAt, versionId }`; marks the last row of the prior page; the next page starts at the first row strictly after it in the active order. `nextCursor` is `null` when the last page is reached.

`pending-count` runs the same JOIN + WHERE with no filters.

## Drafts-tab UI

Row layout (left → right): band pill · title (or `<no title>`) · kind chip · relative age (full timestamp in `title` attr) · sub-line (`slug · N props · M created · compileStatus`, each count rendered only if > 0) · partial-reason banner (amber, only when present).

- The whole row card is a link to `/food/inbox/:sourceId`. The kind chip is layered above it: for `url-*` rows it is an `<a target="_blank" rel="noopener noreferrer">` to `sourceUrl` (stops propagation, no inspector nav); for `text`/`screenshot` rows it is a button that opens `ViewSourceDialog` inline.
- Band pill is colour-coded (clean=emerald, minor=amber, attention=orange, blocked=rose); hover `title` shows the top-3 signal codes.
- Filters: band / kind / partial-reason chip groups (multi-select), fresh-only checkbox, sort `<select>`. Band group defaults to all-selected; "all selected" and empty kind/partial-reason collapse to `undefined` on the wire. A "Clear filters" button resets to defaults.
- Empty states: pristine + no rows → "Inbox is empty…"; filters changed + no rows → "No drafts match your filters." with a Clear-filters link.
- The list and the pending-count both poll on a 60s `refetchInterval` (paused while the tab is hidden) so newly-completed ingests surface without a manual refresh.

## Business rules

- Drafts tab surfaces ONLY ingest-originated, still-pending drafts (`source_id` present via the JOIN, `reviewed_at IS NULL`). Manually-authored, approved, and archived-recipe drafts stay out by design.
- The band filter present as an array — including `[]` — is the explicit allowed set, not "no filter"; toggling every band chip off yields an empty result and the filtered-empty state.
- `partialReason` is always part of the heuristic input and is surfaced on the row as a banner for clarity.
- Filters reset on tab change (each tab owns its own hash).

## Edge cases (covered)

- Invalid `?tab` → normalised to `?tab=drafts` via `replace`.
- Whitespace/empty title → rendered as `<no title>`.
- All bands toggled off → empty set → filtered-empty state with Clear-filters.
- Score ties across identical `ingested_at` → `versionId` tie-break (encoded in the cursor).
- A draft transitioning to compiled while open → next 60s poll refreshes and may reorder it.
- Approving a draft in another tab → the other tab's 60s poll drops the row.

## Acceptance criteria

### Routes & shell

- [x] `/food/inbox` and `/food/inbox/:sourceId` are registered in the food app route manifest; an Inbox nav entry exists.
- [x] `InboxPage` reads `?tab` and renders the active tab; default `drafts`; invalid value is normalised to `?tab=drafts`.
- [x] Tab strip switches tabs via `navigate` (back-nav restores the prior tab); each tab has `role="tab"`/`aria-selected`.
- [x] The page header shows the `pending-count` value (loading placeholder until resolved).

### Drafts tab

- [x] `DraftsTab` renders one `DraftRow` per item: band pill, title (or `<no title>`), kind chip, relative age, sub-line counts, partial-reason banner.
- [x] Hovering the band pill shows the top-3 signal codes.
- [x] The kind chip opens the source URL in a new tab for `url-*` rows, or `ViewSourceDialog` inline for `text`/`screenshot` — without navigating to the inspector.
- [x] Clicking elsewhere on the row navigates to `/food/inbox/:sourceId`.
- [x] The list polls every 60s while visible (paused when hidden).

### Filters

- [x] Band / kind / partial-reason chips are multi-select; band defaults to all-selected.
- [x] Fresh-only toggle applies the `< 24h` filter; sort dropdown supports all four orders.
- [x] Filter state syncs to the URL hash (base64url, defaults dropped); refresh restores it.
- [x] "Clear filters" resets to defaults; the filtered-empty state exposes the same reset.

### Server

- [x] `POST /inbox/list` implements the JOIN + WHERE + batched gather + in-memory band/partial/fresh filter + sort + cursor pagination.
- [x] `GET /inbox/pending-count` returns the total pending ingest-originated drafts (no filters).
- [x] Quality inputs are gathered exactly once per `list` call (single batched round-trip, no N+1).
- [x] Approved sources (`reviewed_at IS NOT NULL`) and archived recipes' drafts are excluded (DB-level tests pin this).

### Tests

- [x] Vitest + RTL suites cover `InboxPage`, `InboxLayout`, `DraftsTab` (which exercises `DraftsFilters`, `DraftRow`, and the band pill), `drafts-filters` hash codec, and `ViewSourceDialog`.
- [x] DB-level tests cover sort orders, cursor pagination, exclusion of reviewed/archived rows, and band/partial/fresh filtering.

## Out of scope

- The inspector body, Rejected/Failed tab content, and the quality scoring rubric live in their own PRDs.
- Bulk actions, per-row inline approve/reject, saved filter presets, free-text search, per-source cost on the row, and WebSocket/SSE push — all explicit no-gos for v1.

See `ideas/` for the deferred sidebar badge and frontend infinite-scroll work.
