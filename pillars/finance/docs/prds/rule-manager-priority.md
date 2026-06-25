# Global Rule Manager & Priority Ordering

Status: Partial — server matching, browse-mode rule manager, drag-reorder, dual-section impact preview, and orphaned-entity badges all shipped. The import-time override indicators are NOT priority-aware yet (they still rank by the legacy match-type hierarchy), and the shared ChangeSet apply drops `priority` on edit — both deferred to [ideas/priority-aware-import-override-indicators](../ideas/priority-aware-import-override-indicators.md).

A `priority` column on `transaction_corrections` gives the user explicit control over which correction rule wins when several match a transaction (lower number = higher precedence). A "Manage Rules" entry on the import Review step opens the correction dialog in a browse-all mode for full-rule-set CRUD with drag-to-reorder, an impact preview spanning both import and existing transactions, and override indicators. Orphaned entities are flagged on the entities page.

Rules are correction rules, not tag rules — online-vs-in-person and other tag-only classification stays in `transaction_tag_rules` (see the tag-rules PRD). A correction rule carries `entityId`/`entityName`, `transactionType`, `tags`, `location`, a `matchType` (`exact`/`contains`/`regex`), `confidence`, `isActive`, and `priority`.

## Data Model

`transaction_corrections` (finance SQLite DB) carries `priority INTEGER NOT NULL DEFAULT 0` (lower = higher precedence), indexed (`idx_corrections_priority`). The contract `Correction`/`CorrectionRow` types and `CorrectionSchema` expose `priority: number`; `toCorrection`/`correctionToRow` round-trip it.

Priority is purely user-controlled — match type has no bearing on evaluation order. (One-time backfill seeding priorities from the old exact/contains/regex bands is migration history, not part of the running contract.)

## REST API Surface

All under the finance pillar's `corrections.*` and `entityUsage.*` ts-rest contracts. No new endpoints — `priority` threads through the existing surface:

- `GET /corrections` — list; each row includes `priority`.
- `POST /corrections` — create/reinforce; body accepts optional `priority` (int, non-negative, defaults to 0).
- `PATCH /corrections/:id` — update; body accepts optional `priority`.
- `POST /corrections/find-match` — winning correction for a description (priority-ordered, null when none).
- `POST /corrections/list-merged` — full rule set with caller-supplied pending ChangeSets folded in before slicing, paginated; powers the browse sidebar.
- `POST /corrections/preview-changeset` — before/after match impact of a ChangeSet against caller-supplied transactions (`max(2000)` per request); reused for both import and existing-transaction previews.
- `POST /corrections/apply-changeset` — apply a ChangeSet atomically, returns the full rule set.
- `GET /entity-usage?orphanedOnly=true|false` — entities (fetched live from the contacts pillar) joined in-memory against `finance.transactions` for a per-entity `transactionCount`; `orphanedOnly=true` returns only `transactionCount === 0`.

Matching (`findAllMatchingCorrectionFromRules` pure helper, `findAllMatchingTransactionCorrectionsFromDb` DB helper, and `reclassify-existing`) order candidates by `priority ASC, id ASC`; the first active rule at/above `minConfidence` wins.

## Business Rules

- [x] Lower `priority` number = higher precedence; ties break by `id ASC` (stable).
- [x] Server matching evaluates rules in `priority ASC, id ASC` order — the old exact>contains>regex hierarchy no longer drives DB/reclassify evaluation; the first eligible match wins, no further rules evaluated.
- [x] Inactive rules and rules below `minConfidence` are filtered out before pattern testing; disabling the winner promotes the next-priority active rule.
- [x] Browse-mode CRUD (add/edit/disable/remove and drag-reorder) produces ChangeSet ops in the local pending store — no immediate DB writes; Cancel discards the session's changes without touching previously-accumulated pending ops.
- [x] Drag-reorder renumbers priorities with gaps of 10 (10, 20, 30, …) so future insertions don't cascade-renumber the list; the sidebar always renders in effective-priority order.
- [x] The browse sidebar shows DB rules merged with pending rules, visually distinguished, and supports text search across pattern, entity name, match type, and location.
- [x] The impact preview in browse mode has two sections — import transactions and existing transactions — both computed through the same matcher; existing transactions are fetched once on open.
- [x] Re-classification of existing transactions (`reclassify-existing`) walks rules in `priority ASC, id ASC` order.

## UI Surface

- [x] **Manage Rules button** — on the import Review step header; opens the correction dialog in browse mode; disabled while the dialog is open.
- [x] **Browse-all rule manager** — three-pane dialog (sidebar / detail editor / impact panel). Sidebar lists the merged rule set, search-filterable, drag-reorderable when search is empty and ≥2 rules. Selecting a rule loads it into the detail editor. A separate full-page `RulesBrowserPage` provides the same rule CRUD outside the import flow.
- [x] **Drag-to-reorder** — each row has a drag handle; a drop renumbers affected rules' `priority` in gaps of 10 via `edit` ops; works across mixed DB + pending rules; reorder-then-Cancel discards the changes.
- [x] **Impact preview** — "Import transactions" and "Existing transactions" sections with per-section counts; when the existing-transaction set exceeds `PREVIEW_CHANGESET_MAX_TRANSACTIONS` (2000) the preview caps and shows a "preview truncated — first 2000 of N" hint; stale/re-run preview behaves identically to proposal mode.
- [x] **Override indicators** — `TransactionCard` shows a "Rule matched" badge plus a "+N overridden" popover when more than one rule matched, listing each overridden rule's pattern, match type, priority, confidence, and entity. `ProcessedTransaction.matchedRules` holds all matches (first = winner). NOTE: the import-time `matchedRules` ordering is still the legacy match-type heuristic, not the `priority` column — see the ideas file.
- [x] **Orphaned entities** — entities with `transactionCount === 0` show a muted "Orphaned" badge on `/finance/entities`; a "Show orphaned only" toggle filters the list (server `orphanedOnly` param) and resets to "show all" on mount. Any transaction association counts — an entity with only "skipped" transactions is not orphaned.

## Edge Cases

| Case                                    | Behaviour                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| Zero rules in DB                        | Browse sidebar is empty with just the "Add new rule" button.                 |
| Reorder then Cancel                     | Pending priority `edit` ops are discarded.                                   |
| Two rules at equal priority             | Tie-break by `id` (stable sort).                                             |
| Winning rule disabled (pending op)      | Next-priority active rule becomes the winner; preview and indicators update. |
| Existing-transaction count > 2000       | Preview capped at 2000, truncation hint shown.                               |
| Entity with only "skipped" transactions | Not orphaned — any association counts.                                       |

## Not Built (see ideas)

- Priority-aware import-time override indicators (client re-evaluation still uses the match-type hierarchy) and persisting drag-reorder `priority` through the shared `applyChangeSetToRules` edit path → [ideas/priority-aware-import-override-indicators](../ideas/priority-aware-import-override-indicators.md).
