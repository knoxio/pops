# Epic 04: Lists & Shopping

> Theme: [Food](../README.md)

## Scope

The generic lists/list_items model lives in the **lists pillar** (see its [schema](../../../lists/docs/prds/schema/README.md), [shell module](../../../lists/docs/prds/shell-module/README.md), [CRUD UI](../../../lists/docs/prds/crud-ui/README.md), and [shopping specialisation](../../../lists/docs/prds/shopping-specialisation/README.md) docs). This epic's remaining food-owned deliverable is the food → shopping list "Send" action that aggregates recipe-line quantities through `conversion-table`'s unit-conversion tables and pushes them into a lists-pillar shopping list over the SDK.

After this epic, the user can author a recipe (Epic 01), open it, click "Send to shopping list", pick or create a list at `/lists`, and pull out their phone at the supermarket. The list is flat (no sections) — store-section grouping, pantry subtraction, and plan-derived list generation arrive in **Epic 07 (Pantry-Aware Shopping)**.

This epic is the first cross-domain consumer of the `app-lists` generic package. Food integration is the deliverable; the UI itself is domain-agnostic so a future travel-packing or todos theme plugs in at zero extra cost.

## PRDs

The generic lists work (schema, shell module, CRUD UI, shopping specialisation) now lives in the [lists pillar docs](../../../lists/docs/README.md). The only PRD that stays in food is the Send action:

| #   | PRD                                                          | Summary                                                                                                              | Status      |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------- |
| 142 | [Recipe Send-to-List Action](../prds/send-to-list/README.md) | Food → shopping list: Send button on `dsl-renderer` renderer; picker modal; unit-conversion aggregation; scale-aware | Not started |

### Build order

The lists-pillar surface (schema, shell module, generic CRUD UI at `/lists`, and
the `kind='shopping'` specialisation) is already built — see the
[lists pillar docs](../../../lists/docs/README.md). `send-to-list` is the remaining
food-side work and consumes that surface over the SDK.

- **`send-to-list`** is the food-side button + picker + aggregation. It calls the lists
  pillar over `pillar('lists')` — `list.list`/`list.create` to find or make a
  shopping list and `items.bulkAdd` (or `items.upsert-by-ref` for merge) to push
  the aggregated recipe lines. **`send-to-list` also requires `recipe-crud-pages` amendments**
  (action-menu entry, `RecipeScaleProvider` context, two new food recipe
  endpoints) — these must be agreed alongside `recipe-crud-pages`'s implementation, not
  deferred to `send-to-list`'s slot.

## Dependencies

- **Requires:** the lists pillar's `lists` + `list_items` schema, REST contract, and shopping specialisation — see the [lists pillar docs](../../../lists/docs/README.md). Already built.
- **Requires:** the `plugin-contract` module manifest pattern (mirrors `app-shell` for food).
- **Requires:** `app-shell` / `recipe-crud-pages` / `dsl-renderer` — the recipe detail page is where `send-to-list`'s Send button lives.
- **Requires:** `ingredient-model` (`ingredients` + `ingredient_variants`) and `lines-materialisation` (`recipe_lines` with canonical `qty_g`/`qty_ml`/`qty_count` columns populated by compile). `send-to-list` reads `recipe_lines` directly for aggregation — no live unit-conversion at send time.
- **Requires:** `conversion-table` (`unit_conversions`, `ingredient_weights`, the `resolve` helper). Indirectly via `lines-materialisation` — `recipe_lines` is only populated with usable canonical values after `conversion-table` lands. **`send-to-list` will NOT function until Epic 01 implementation completes**, specifically `conversion-table`.
- **Unlocks:** Epic 07 (pantry-aware shopping) — Epic 07 layers store-section grouping + pantry subtraction on top of this epic's list shape. The lists pillar's `list_items.ref_kind='ingredient'` / `'variant'` is what Epic 07 introspects.
- **Unlocks (cross-domain):** Future travel packing / todo themes can mount `/lists` content without re-implementing.

## Key Decisions

| Decision              | Choice                                                                                                                                                                                                          | Rationale                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lists UI location     | Top-level `/lists` (NOT `/food/lists`)                                                                                                                                                                          | The whole point of the generic lists pillar is genericity. Mounting at the shell root makes the cross-domain promise real and prevents food-shaped retrofitting                                                                                                                                                                                                     |
| Sections in v1        | No sections — flat list. Each shopping list is one ordered list of items                                                                                                                                        | Store-section grouping is owned by **Epic 07** (alongside the ingredient store-section tag). Epic 04 ships before Epic 07 deliberately; adding manual sections now would duplicate it                                                                                                                                                                               |
| Aggregation           | Group by `(ingredient_id, variant_id, canonical_unit)`; sum qty in canonical unit via `lines-materialisation`'s pre-computed `recipe_lines.qty_g`/`qty_ml`/`qty_count`. Drop `prep_state` from the grouping key | Real-world shopping: you buy whole bananas regardless of "diced" / "sliced". prep_state info flows into `list_items.notes` so the user knows what each batch is for. `canonical_unit` is in the key because two recipes whose ingredients land on different canonical units (rare; `ingredient-model`'s `default_unit` enforces it usually) must not silently merge |
| Aggregation fallback  | Recipe lines whose canonical qty is null (`conversion-table` unresolved) become standalone "(unconverted)" items with their original qty + unit                                                                 | `conversion-table` already documents this as a per-line possibility. Send action surfaces it gracefully rather than failing                                                                                                                                                                                                                                         |
| Scaling               | Send action reads the **scaled** quantities from `dsl-renderer`'s renderer scale-factor — NOT the canonical 1× recipe                                                                                           | If the user is viewing the recipe at 4×, they want 4× ingredients on the list. `dsl-renderer`'s scale factor is the source of truth                                                                                                                                                                                                                                 |
| Send picker           | Modal with "Add to existing list" or "Create new" toggle; lists existing shopping lists with item counts                                                                                                        | Lets the user batch a week's worth of recipes into one list before going to the store. The most common workflow                                                                                                                                                                                                                                                     |
| Send button location  | `dsl-renderer`'s renderer's action menu (recipe detail page), NOT a top-level food navigation entry                                                                                                             | Sending is per-recipe, not a global operation. Lives where the user is when they decide                                                                                                                                                                                                                                                                             |
| List naming default   | New shopping lists auto-name `"Shopping list — <yyyy-MM-dd>"` if the user doesn't override                                                                                                                      | Predictable, sortable, immediately recognisable. The picker shows lists by most-recently-updated so today's list floats to top                                                                                                                                                                                                                                      |
| Label denormalisation | List item `label` is computed at send time and stored verbatim per the lists pillar's rule. Renames of the source ingredient do NOT propagate                                                                   | Matches the lists schema; the user trusts what's on the list, not what the database currently says about a slug                                                                                                                                                                                                                                                     |
| Aggregation merge     | When sending a recipe to a list that already contains the same `(ingredient_id, variant_id)`, sum the qty in the existing row and append the recipe name to `notes`                                             | Avoids duplicate rows; preserves provenance; idempotent enough that re-sending a recipe doesn't quietly multiply the list                                                                                                                                                                                                                                           |
| Re-send idempotency   | Sending the same recipe to the same list twice produces double the qty (the second send is a deliberate action). UI warns: "This recipe was already sent to this list on <date>. Send again?"                   | Honest behaviour; users sometimes legitimately want 2× a recipe. Warning prevents accidental doubling                                                                                                                                                                                                                                                               |

## Risks

- **`conversion-table` not shipped first** — `send-to-list`'s aggregation depends on `recipe_lines` having usable canonical quantities. If Epic 01 (where `conversion-table` lives) lags, the send action would land items but skip every line as "unconverted". Mitigation: `send-to-list` calls this out in its dependencies; implementation phase orders Epic 01 before Epic 04 as already documented.
- **Manual reorder + recipe send interplay** — Sending a recipe to a list that the user manually reordered overwrites the order. Mitigation: the lists pillar appends newly-added items at the bottom (highest `position` + 1), not splicing into the user's order.
- **Aggregation grouping miss** — Two recipe lines that humans treat as the same ingredient but with different `ingredient_id` / `variant_id` produce two rows. E.g. `chicken-breast` and `chicken-thigh` are different variants of `chicken`. Mitigation: by design — they ARE different shopping items. The user can manually merge in the list UI.
- **`unit` conflict on merge** — Existing list item is "250g flour", new send adds "1 cup flour". Both are flour by canonical unit (grams via `conversion-table`). Mitigation: aggregation reads only the canonical column, so the merge sums grams; the displayed `label` is regenerated from the merged qty.
- **Picker shows archived lists** — Easy slip. Mitigation: picker filters `archived_at IS NULL`. Operator can restore an archived list before sending (the lists detail page's restore action).
- **`notes` field bloat** — Repeated sends append to `notes`; one item could carry 20 recipe names. Mitigation: `send-to-list` specifies a 500-char cap on the auto-generated provenance trail; oldest entries get truncated with an ellipsis.
- **Generic `/lists` page UX has weak signal** — Empty top-level page with "no lists yet" before any food integration kicks in. Mitigation: the lists index empty state has a "Create your first list" CTA + a tooltip explaining that food and (future) other modules will send lists here.

## Out of Scope

- **Store-section grouping** — Epic 07. Epic 04's shopping list is a flat row sequence.
- **Pantry subtraction** — Epic 07.
- **Plan-derived shopping list generation** ("send all dinner recipes for this week") — Epic 07 once Epic 05 (meal planning) ships.
- **Recurring lists / templates** — Deferred.
- **Sharing / collaboration on lists** — Single-user system.
- **Notifications for `due_at` items** — None in v1 (matches theme decision).
- **Search across lists** — Deferred.
- **Bulk select / bulk delete items inside a list** — Out of scope for v1; per-row delete only.
- **Per-item images** — Out of scope.
- **Drag-and-drop reorder across multiple lists** — Out of scope; reorder within a single list only.
- **Voice input for adding items** — Theme-level decision (no voice in v1).
- **Print view** — Deferred; the mobile view is the primary shopping surface.
- **Other `kind` specialisations** (`packing`, `todo`, `generic`) beyond the generic CRUD — those will get their own PRDs in future themes. Epic 04 ships ONLY the shopping specialisation.
- **Lists module's own ingestion / external sync** — None. Lists are entirely user-managed plus food-sent.
- **Cross-list reference / "include another list"** — Out of scope.
