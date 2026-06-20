# Epic 04: Lists & Shopping

> Theme: [Food](../README.md)

## Scope

Make the `packages/app-lists` schema scaffolded in [PRD-112](../prds/112-lists-schema/README.md) usable: register it as a shell module, build a generic lists CRUD UI at `/lists` that handles any `kind`, specialise the shopping-list affordances (check-off, batch-uncheck, clear-checked, mobile-first row interactions), and wire up the food → shopping list "Send" action that aggregates recipe-line quantities through PRD-123's unit-conversion tables.

After this epic, the user can author a recipe (Epic 01), open it, click "Send to shopping list", pick or create a list at `/lists`, and pull out their phone at the supermarket. The list is flat (no sections) — store-section grouping, pantry subtraction, and plan-derived list generation arrive in **Epic 07 (Pantry-Aware Shopping)**.

This epic is the first cross-domain consumer of the `app-lists` generic package. Food integration is the deliverable; the UI itself is domain-agnostic so a future travel-packing or todos theme plugs in at zero extra cost.

## PRDs

| #   | PRD                                                                                | Summary                                                                                                                 | Status      |
| --- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------- |
| 139 | [app-lists Shell Module](../prds/139-app-lists-shell-module/README.md)             | Manifest registration; `/lists` route mount; sidebar entry; tRPC router scaffolding (mirrors PRD-118 for food)          | Not started |
| 140 | [Generic Lists CRUD UI](../prds/140-lists-crud-ui/README.md)                       | `/lists` index + `/lists/:id` detail; create / rename / archive / restore; ad-hoc item add; reorder; works for any kind | Not started |
| 141 | [Shopping List Specialisation](../prds/141-shopping-list-specialisation/README.md) | `kind='shopping'` affordances: check-off, batch uncheck-all, clear-checked, sort options, mobile-first interactions     | Not started |
| 142 | [Recipe Send-to-List Action](../prds/142-recipe-send-to-list/README.md)            | Food → shopping list: Send button on PRD-121 renderer; picker modal; unit-conversion aggregation; scale-aware           | Not started |

### Build order

```
139 ──► 140 ──► (141, 142 in parallel)
```

- **PRD-139** lands first — the `/lists` route mount + manifest is the integration point everything else builds on. Pure shell wiring; no UI of substance.
- **PRD-140** is the generic skeleton. List index, detail, CRUD; no kind-specific affordances. Every kind renders the same way out of the box. Adds two amendments noted in PRD-140 itself: `updateList` to PRD-112's services and a router-owned aggregate query that bypasses PRD-112's `listLists`.
- **PRD-141** specialises the shopping kind on top of PRD-140 — extra controls in the detail view, mobile-first row patterns. Adds two new mutations (`lists.items.uncheckAll`, `lists.items.removeChecked`) that amend PRD-140's `listsRouter.items`. UI-only otherwise; no schema changes.
- **PRD-142** is the food-side button + picker + aggregation. Builds in parallel with 141 once 140's API is in place; only the E2E "send → see in list" flow needs 141 to validate end-to-end. **PRD-142 also requires PRD-119 amendments** (action-menu entry, `RecipeScaleProvider` context, two new `food.recipes.*` procedures) — these must be agreed alongside PRD-119's implementation, not deferred to PRD-142's slot.

## Dependencies

- **Requires:** PRD-112 (lists + list_items schema + service layer in `packages/app-lists`). PRD-112 is in Epic 00 and lands during Epic 00 implementation.
- **Requires:** PRD-098 / PRD-101 module manifest pattern (mirrors PRD-118 for food).
- **Requires:** PRD-118 / PRD-119 / PRD-121 — the recipe detail page is where PRD-142's Send button lives.
- **Requires:** PRD-106 (`ingredients` + `ingredient_variants`) and PRD-116 (`recipe_lines` with canonical `qty_g`/`qty_ml`/`qty_count` columns populated by compile). PRD-142 reads `recipe_lines` directly for aggregation — no live unit-conversion at send time.
- **Requires:** PRD-123 (`unit_conversions`, `ingredient_weights`, the `resolve` helper). Indirectly via PRD-116 — `recipe_lines` is only populated with usable canonical values after PRD-123 lands. **PRD-142 will NOT function until Epic 01 implementation completes**, specifically PRD-123.
- **Unlocks:** Epic 07 (pantry-aware shopping) — Epic 07 layers store-section grouping + pantry subtraction on top of this epic's list shape. The `list_items.ref_kind='ingredient'` / `'variant'` already in PRD-112 is what Epic 07 introspects.
- **Unlocks (cross-domain):** Future travel packing / todo themes can mount `/lists` content without re-implementing.

## Key Decisions

| Decision              | Choice                                                                                                                                                                                          | Rationale                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lists UI location     | Top-level `/lists` (NOT `/food/lists`)                                                                                                                                                          | The whole point of PRD-112's `app-lists` scaffold is genericity. Mounting at the shell root from day one makes the cross-domain promise real and prevents food-shaped retrofitting                                                                                                                                                                       |
| Sections in v1        | No sections — flat list. Each shopping list is one ordered list of items                                                                                                                        | Store-section grouping is owned by **Epic 07** (alongside the ingredient store-section tag). Epic 04 ships before Epic 07 deliberately; adding manual sections now would duplicate it                                                                                                                                                                    |
| Aggregation           | Group by `(ingredient_id, variant_id, canonical_unit)`; sum qty in canonical unit via PRD-116's pre-computed `recipe_lines.qty_g`/`qty_ml`/`qty_count`. Drop `prep_state` from the grouping key | Real-world shopping: you buy whole bananas regardless of "diced" / "sliced". prep_state info flows into `list_items.notes` so the user knows what each batch is for. `canonical_unit` is in the key because two recipes whose ingredients land on different canonical units (rare; PRD-106's `default_unit` enforces it usually) must not silently merge |
| Aggregation fallback  | Recipe lines whose canonical qty is null (PRD-123 unresolved) become standalone "(unconverted)" items with their original qty + unit                                                            | PRD-123 already documents this as a per-line possibility. Send action surfaces it gracefully rather than failing                                                                                                                                                                                                                                         |
| Scaling               | Send action reads the **scaled** quantities from PRD-121's renderer scale-factor — NOT the canonical 1× recipe                                                                                  | If the user is viewing the recipe at 4×, they want 4× ingredients on the list. PRD-121's scale factor is the source of truth                                                                                                                                                                                                                             |
| Send picker           | Modal with "Add to existing list" or "Create new" toggle; lists existing shopping lists with item counts                                                                                        | Lets the user batch a week's worth of recipes into one list before going to the store. The most common workflow                                                                                                                                                                                                                                          |
| Send button location  | PRD-121's renderer's action menu (recipe detail page), NOT a top-level food navigation entry                                                                                                    | Sending is per-recipe, not a global operation. Lives where the user is when they decide                                                                                                                                                                                                                                                                  |
| List naming default   | New shopping lists auto-name `"Shopping list — <yyyy-MM-dd>"` if the user doesn't override                                                                                                      | Predictable, sortable, immediately recognisable. The picker shows lists by most-recently-updated so today's list floats to top                                                                                                                                                                                                                           |
| Label denormalisation | List item `label` is computed at send time and stored verbatim per PRD-112's rule. Renames of the source ingredient do NOT propagate                                                            | Matches PRD-112; the user trusts what's on the list, not what the database currently says about a slug                                                                                                                                                                                                                                                   |
| Aggregation merge     | When sending a recipe to a list that already contains the same `(ingredient_id, variant_id)`, sum the qty in the existing row and append the recipe name to `notes`                             | Avoids duplicate rows; preserves provenance; idempotent enough that re-sending a recipe doesn't quietly multiply the list                                                                                                                                                                                                                                |
| Re-send idempotency   | Sending the same recipe to the same list twice produces double the qty (the second send is a deliberate action). UI warns: "This recipe was already sent to this list on <date>. Send again?"   | Honest behaviour; users sometimes legitimately want 2× a recipe. Warning prevents accidental doubling                                                                                                                                                                                                                                                    |

## Risks

- **PRD-123 not shipped first** — PRD-142's aggregation depends on `recipe_lines` having usable canonical quantities. If Epic 01 (where PRD-123 lives) lags, the send action would land items but skip every line as "unconverted". Mitigation: PRD-142 calls this out in its dependencies; implementation phase orders Epic 01 before Epic 04 as already documented.
- **Manual reorder + recipe send interplay** — Sending a recipe to a list that the user manually reordered overwrites the order. Mitigation: PRD-141 specifies that newly-sent items append at the bottom of the list (highest `position` + 1), not splicing into the user's order.
- **Aggregation grouping miss** — Two recipe lines that humans treat as the same ingredient but with different `ingredient_id` / `variant_id` produce two rows. E.g. `chicken-breast` and `chicken-thigh` are different variants of `chicken`. Mitigation: by design — they ARE different shopping items. The user can manually merge in the list UI.
- **`unit` conflict on merge** — Existing list item is "250g flour", new send adds "1 cup flour". Both are flour by canonical unit (grams via PRD-123). Mitigation: aggregation reads only the canonical column, so the merge sums grams; the displayed `label` is regenerated from the merged qty.
- **Picker shows archived lists** — Easy slip. Mitigation: picker filters `archived_at IS NULL`. Operator can restore an archived list before sending (PRD-140's restore action).
- **`notes` field bloat** — Repeated sends append to `notes`; one item could carry 20 recipe names. Mitigation: PRD-142 specifies a 500-char cap on the auto-generated provenance trail; oldest entries get truncated with an ellipsis.
- **Generic `/lists` page UX has weak signal** — Empty top-level page with "no lists yet" before any food integration kicks in. Mitigation: PRD-140's empty state has a "Create your first list" CTA + a tooltip explaining that food and (future) other modules will send lists here.

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
