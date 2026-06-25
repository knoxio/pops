# Recipe Send-to-List

Status: Done. The recipe detail page action menu turns a recipe version's ingredient lines into shopping-list items in the `lists` pillar. Cross-pillar writes go over REST (no shared DB). Notes are never truncated and merge-label regeneration is owned by the `lists` pillar, not food — the food-side "500-char notes cap + per-merge relabel from summed qty" was never wired; see `../../ideas/send-to-list-merge-fidelity.md`.

## Purpose

A user viewing a recipe at some scale factor (e.g. "Chicken Tikka Masala ×4") opens the detail-page action menu, picks "Send to shopping list...", chooses an existing shopping list or names a new one, and the ingredients land in that list with scaled, deduplicated quantities. Aggregation collapses repeated ingredients; canonical (compiled-unit) lines merge into matching list rows by ref; unconverted lines are appended verbatim.

The food pillar owns the recipe-side aggregation and preview. It never touches the lists DB — it calls the `lists` pillar over HTTP via a `ListsClient` (resolved from `POPS_PILLARS`; injectable as a stub in tests).

## Data sources (read-only, food DB)

- `recipe_versions` — `title`, `compile_status` (must be `compiled`), parent `recipe_id`.
- `recipes` — `slug`.
- `recipe_lines` — `ingredient_id`, `variant_id`, `prep_state_id`, `original_qty`, `original_unit`, `qty_g | qty_ml | qty_count`, `canonical_unit`, `position`. Canonical qty fields are written at compile time; the send action reads them — there is no second unit-conversion pass here.
- `ingredients.name`, `ingredient_variants.name`, `prep_states.slug` / `.name` — label generation (left-joined).

Lists data (lists pillar, over REST): shopping lists and their items.

## REST API surface

Contract: `pillars/food/src/contract/rest-send-to-list.ts`, mounted under `sendToList` in `foodContract`.

- `GET /recipes/versions/:versionId/send-to-list/preview?scaleFactor=<n>` — returns `SendPreview`. `400` if the version is not compiled, `404` if the version is unknown.
- `POST /recipes/versions/:versionId/send-to-list` — body `{ scaleFactor?, target }` where `target` is `{ kind: 'existing', listId }` or `{ kind: 'new', name }`. Always `200` with a discriminated result.

```
SendPreview = {
  recipeTitle: string
  scaleFactor: number
  canonicalItems: PreviewItem[]      // post-aggregation, post-scale
  unconvertedItems: PreviewItem[]    // one per line with all canonical qty null
  alreadySentToListIds: number[]     // shopping lists whose item notes mention this recipe
}
PreviewItem = { label, qty|null, unit|null, ingredientId, variantId|null, prepStateLabel|null, sourceLineIds[] }

SendResult =
  | { ok: true, listId, addedCount, mergedCount }
  | { ok: false, reason: SendToListError }

SendToListError =
  'RecipeNotFound' | 'NoIngredients' | 'TargetListNotFound' | 'TargetListArchived'
  | 'TargetListNotShopping' | 'NameRequiredForNew' | 'CompileNotReady'
```

## Cross-pillar `ListsClient` (HTTP)

Each call is its own atomic operation against the `lists` pillar — there is no cross-pillar transaction; lists owns its own consistency.

- `getList(id)` → header `{ id, kind, ownerApp, archivedAt }` or null.
- `createShoppingList(name)` → `POST /lists { name, kind:'shopping', ownerApp:'food' }` → new id.
- `upsertByRef(listId, { refKind, refId, label, qty, unit, notes, onConflict:'merge-additive' })` → `{ outcome:'inserted'|'merged'|'skipped', itemId }`. The lists pillar atomically merges by `(refKind, refId)`.
- `addItem(listId, { label, qty, unit, refKind:'free', refId:null, notes })` — for unconverted lines.
- `searchShoppingListIdsByNotes(notesContains)` → `GET /items?kind=shopping&notesContains=...`, deduped list ids.

## Aggregation (prepare + send share it)

1. Load joined `recipe_lines` for the version, ordered by `position`.
2. Per line, pick the canonical qty for its `canonical_unit` (`g`→`qty_g`, `ml`→`qty_ml`, `count`→`qty_count`). Null → the line is **unconverted**.
3. Canonical lines group by `(ingredient_id, variant_id, canonical_unit)`. Sum `qty × scaleFactor` per group. `prep_state` is **dropped** from the grouping key but distinct prep slugs are collected per group and joined (sorted) into the label.
4. Unconverted lines are emitted one-per-line (no aggregation), carrying `original_qty` + `original_unit`.
5. Label format: `"<qty> <unit> <ingredient>[ <variant>][ (<prep,…>)]"`. Integer qty stays integer; fractional rounds to 2 decimals with trailing zeros trimmed.

## Send flow

1. Load version; `CompileNotReady` if `compile_status != 'compiled'`, `RecipeNotFound` if version or parent recipe missing.
2. Clamp `scaleFactor`: undefined / non-finite / ≤0 → 1.
3. Aggregate. Empty result → `NoIngredients`.
4. Resolve target:
   - `existing`: get the list header; `TargetListNotFound` if absent, `TargetListArchived` if archived, `TargetListNotShopping` if `kind != 'shopping'`.
   - `new`: trim name; `NameRequiredForNew` if empty; else create a `kind:'shopping'`, `ownerApp:'food'` list.
5. Per item:
   - Canonical (ref = `variant`+variantId, else `ingredient`+ingredientId): `upsertByRef(... onConflict:'merge-additive')`. Counts as `merged` or `added` per the lists outcome.
   - Unconverted: `addItem(... refKind:'free')` — always a fresh insert, counted as `added`.
   - Each item carries a `notes` fragment: `"<recipe title>"` or `"<recipe title> (<prep>)"`.
6. Return `{ ok:true, listId, addedCount, mergedCount }`.

## UI

`RecipeDetailPage` mounts a `RecipeScaleProvider` context; `useRecipeScale()` exposes the current scale factor. The page passes it to `RecipeRenderer` (pure-presentation prop) and the send modal reads the same value.

- Action menu gains "Send to shopping list..." (between Cook now / Archive). Disabled when the recipe has 0 lines or `compile_status != 'compiled'`.
- `SendToListModal` (mounted under the scale provider) calls the preview endpoint on open. While loading it shows a status line; on data it renders the target picker + preview.
- **Target picker**: "Add to existing" radio (scrollable shopping lists with name + item count + last-updated; disabled with a hint when none exist — modal auto-flips to "new"). Each existing row shows an "Already sent" badge when its id is in `alreadySentToListIds`. "Create new" radio with a name input prefilled `"Shopping list — YYYY-MM-DD"`, editable.
- **Preview**: canonical and unconverted sections; each lists the first 6 rows with a `…N more` inline expander.
- **Send button**: label shows the live item count; disabled while loading / pending / when nothing to send. Pending shows a "sending" label. On success the modal closes and a toast fires `"Sent N items to <list>"` with a "View list" link to the lists pillar. On error the modal stays open with an inline `role="alert"` message. Closing the modal mid-flight does NOT cancel the in-flight request.

## Business rules

- Per recipe **version**, not per recipe — pins to the version being viewed.
- `scaleFactor` defaults to 1; ≤0 / non-finite → 1.
- `optional` lines are included (no exclusion in this version).
- Canonical merge matches on `(refKind, refId)`, not on label — a hand-edited list-item label still merges as long as its ref is intact.
- Unconverted lines never merge (`refKind:'free'`, no ref) — repeated sends accumulate separate rows.
- Notes on merge are appended by the lists pillar with a `\n` separator and are **never truncated**.
- New lists are always `kind:'shopping'`, `ownerApp:'food'`.
- The picker shows only shopping lists; non-shopping lists are excluded.
- "Already sent" is a soft, informational warning — it never blocks the send.

## Edge cases

- All-unconvertible recipe → `canonicalItems=[]`, every line unconverted; send still inserts free items with original qty/unit.
- Same `ingredient_id` from two lines with different prep states → merged into one canonical item (prep dropped from key); both prep slugs collected.
- `variantId=null` vs `variantId=5` for the same ingredient → distinct keys, two items.
- Recipe with `compile_status='failed'` → menu item disabled; the preview endpoint returns `400` / send returns `CompileNotReady` if forced.
- Target list deleted / archived / made non-shopping between preview and send → the respective error code; modal surfaces it and stays open.
- Empty new-list name → button disabled client-side; server defends with `NameRequiredForNew`.
- Rapid double Send → button disabled while the mutation is pending.

## Acceptance criteria

### Contract & server

- [x] `GET /recipes/versions/:versionId/send-to-list/preview` returns `SendPreview`; `404` for unknown version, `400` for uncompiled.
- [x] `POST /recipes/versions/:versionId/send-to-list` returns the discriminated `{ ok }` result; all `SendToListError` codes fire on their preconditions (`RecipeNotFound`, `NoIngredients`, `TargetListNotFound`, `TargetListArchived`, `TargetListNotShopping`, `NameRequiredForNew`, `CompileNotReady`).
- [x] Canonical aggregation groups by `(ingredient_id, variant_id, canonical_unit)`, drops `prep_state` from the key, collects distinct prep slugs, and multiplies summed qty by `scaleFactor`.
- [x] Unconverted lines are emitted one-per-line with original qty/unit and never merge.
- [x] `scaleFactor` clamps undefined / non-finite / ≤0 to 1.
- [x] `target.kind='new'` creates a `kind:'shopping'`, `ownerApp:'food'` list via the lists pillar.
- [x] Canonical items go through `upsertByRef(... onConflict:'merge-additive')`; unconverted via `addItem(refKind:'free')`.
- [x] `alreadySentToListIds` comes from the lists pillar's `notesContains` search over shopping lists.
- [x] Cross-pillar writes go over HTTP via an injectable `ListsClient` (stubbed in the integration test) — no shared-DB transaction.
- [x] Integration test (`pillars/food/src/api/__tests__/send-to-list.test.ts`): preview a compiled version, send to a new shopping list, assert add count + recorded upserts + `merge-additive`; reject a non-shopping target; `404` on unknown version preview.

### UI

- [x] Action menu "Send to shopping list..." entry, disabled when 0 lines or not compiled.
- [x] Modal mounts under `RecipeScaleProvider`; `useRecipeScale()` feeds the same scale factor to preview, send, and `RecipeRenderer`.
- [x] Existing-list radio lists shopping lists (disabled with a hint when none); per-row "Already sent" badge from `alreadySentToListIds`.
- [x] Create-new name prefills `"Shopping list — YYYY-MM-DD"`, editable.
- [x] Preview shows canonical + unconverted with a `…N more` expander.
- [x] Send button label shows the live item count; success toast links to the list; error keeps the modal open; closing mid-flight does not cancel the request.
- [x] Component test (`pillars/food/app/src/pages/recipes/send-to-list/__tests__/SendToListModal.test.tsx`) covers create-new and existing-list submission bodies.

## Out of scope (this version)

- Per-item exclusion checkboxes in the preview.
- Multi-recipe batch sending (plan-derived).
- Pantry-aware subtraction; per-aisle section grouping.
- Persisting a "last list sent to" default — the picker always opens.
- Sending to non-shopping lists.
- See `../../ideas/send-to-list-merge-fidelity.md` for the unbuilt notes 500-char cap and per-merge label regeneration from the summed qty.
