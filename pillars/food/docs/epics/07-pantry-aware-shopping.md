# Epic 07: Pantry-Aware Shopping

> Theme: [Food](../README.md)

## Scope

Introduce the store-section taxonomy that `ingredient-model` deferred, then use it to generate a plan-derived shopping list that subtracts current pantry batches from the upcoming plan's requirements. Two PRDs: a new `ingredient_tags` table with `store-section:<value>` namespaced tags + CRUD additions to `data-page`, and a `/food/shopping/from-plan` page (plus a button on `/food/plan`) that walks the plan's recipes, computes needs, subtracts batches, and creates a new shopping list with items sorted by store section.

After this epic, the user picks a date range on Sunday morning, sees a preview of "here's what you need to buy across these N planned recipes after accounting for what's already in the fridge", clicks Generate, and a new shopping list appears in `/lists` with items ordered by aisle.

This epic closes the food theme's value loop: ingest → recipes → plan → cook → fridge → solver → plan-derived shopping.

## PRDs

| #   | PRD                                                                               | Summary                                                                                                             | Status      |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------- |
| 151 | [Store-Section Taxonomy](../prds/store-section-taxonomy/README.md)                | `ingredient_tags(ingredient_id, tag)` many-to-many; `store-section:*` namespaced tags; CRUD addition to `data-page` | Done        |
| 152 | [Plan-Derived Shopping List Generator](../prds/plan-shopping-generator/README.md) | `/food/shopping/from-plan` + plan-grid button; strict pantry subtraction; section-sorted output                     | Not started |

### Build order

```
151 ──► 152
```

`store-section-taxonomy` introduces the taxonomy that `plan-shopping-generator` reads. `store-section-taxonomy` is largely schema + CRUD; `plan-shopping-generator` is the generator UX + algorithm on top.

## Dependencies

- **Requires:** `ingredient-model` (ingredients schema; `store-section-taxonomy` extends).
- **Requires:** `batch-model` (`batches` + `qty_remaining` + variant FK).
- **Requires:** `plan-entry-model` (`plan_entries`; `plan-shopping-generator` reads).
- **Requires:** `lines-materialisation` (`recipe_lines` with canonical qty + `variant_id` + `prep_state_id` + `optional`).
- **Requires:** `data-page` (`/food/data` page; `store-section-taxonomy` adds a Tags sub-tab or extends the Ingredients tab).
- **Requires:** `crud-ui` (`lists.list.create` + `lists.items.bulkAdd`; `plan-shopping-generator` calls these).
- **Requires:** `planning-page` (`/food/plan` header; `plan-shopping-generator` adds the entry button).
- **Requires:** `batch-lifecycle` (`batches.deleted_at` for the subtract query — only non-deleted batches count as stock).
- **Unlocks:** End of the food theme's docs phase (D9 — completeness pass) once this epic ships.

## Key Decisions

| Decision                | Choice                                                                                                                                                                                                            | Rationale                                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tag schema              | New `ingredient_tags(ingredient_id, tag)` many-to-many table; `tag` is free-form TEXT; convention is `store-section:produce`-style namespaced values                                                              | `ingredient-model` deferred this; user-chosen flexible model future-proofs for `diet:vegan` / `allergen:nuts` / etc. Many-to-many lets an ingredient carry multiple section tags if needed ("oils → pantry AND condiments")      |
| v1 section vocabulary   | Suggested (not enforced) set: `produce`, `dairy`, `meat`, `pantry`, `frozen`, `bakery`, `condiments`, `beverages`, `other`                                                                                        | Covers most supermarket layouts. Convention-only, not a CHECK constraint — users can introduce custom sections (`butcher`, `farmers-market`) without a migration                                                                 |
| Section grouping render | Generator INSERTs shopping-list items in section-sorted order (no schema change on `list_items`). `shopping-specialisation`'s flat-list renderer is unchanged                                                     | Walking aisles in order = items in order. Explicit section headers in the list UI would require a `list_items.section_label` column or a metadata table — deferred. Order alone delivers 90% of the value                        |
| Uncategorised handling  | Ingredients with no `store-section:*` tag group under a virtual "Other" section at the bottom of the generated list                                                                                               | Avoids forcing the user to tag everything before shopping is useful. The "Other" bucket is a soft prompt to curate                                                                                                               |
| Plan window             | User-picks date range. Default = next 7 days from today. Stores no preference; the user re-picks each generation                                                                                                  | Most flexible workflow; matches mixed habits (weekend shopping for Sat-Wed, fortnightly batch, etc.). `planning-page`'s ISO-week grid is one source of plan data but doesn't dictate the shopping window                         |
| Pantry subtraction      | Strict by `(ingredient_id, variant_id, canonical_unit)` — mirrors `send-to-list`'s send-action aggregation verbatim, including dropping `prep_state` from the grouping key. NO substitution-aware reduction in v1 | Substitution-aware would require running `cook-solver`'s solver inside the generator, which complicates the math and quirks when the user later doesn't actually substitute. Keep it predictable                                 |
| Pantry subtraction unit | Sum batches whose `unit` matches the line's `canonical_unit`. Batches with mismatched units don't subtract (e.g. a `count` of bananas doesn't reduce a `g` need for banana)                                       | Aligns with `send-to-list`'s rule that `conversion-table`'s conversion isn't applied at the cook / shopping layer — only at compile. Mismatches surface as "buy more" entries                                                    |
| Generator entry         | Dedicated `/food/shopping/from-plan` page (canonical surface with preview) + a "Make shopping list" button in `planning-page`'s `/food/plan` header                                                               | Page is the discoverable home for the feature; plan-grid button is the high-context shortcut ("I'm staring at next week's plan")                                                                                                 |
| Generator output        | Creates a NEW shopping list via `crud-ui`'s `lists.list.create({ kind: 'shopping', ownerApp: 'food' })` + `lists.items.bulkAdd`. Name defaults to "Shopping list — <date range>"                                  | Never appends to an existing list (different mental model from `send-to-list`'s recipe-send). A future PRD may add "append to..." if user demand emerges                                                                         |
| Already-on-list dedup   | Generator does NOT check for duplicate items across other lists. Two shopping lists for the same week is the user's problem to manage                                                                             | Single-user simplicity. Lists are cheap to delete                                                                                                                                                                                |
| Preview UX              | Before generation, show a preview table: ingredient / variant / needed qty / pantry qty / shortfall qty / section. User can dismiss + adjust the date range, but cannot edit individual lines                     | Keeps the contract clean: generator is deterministic given inputs. Tweaking individual quantities is what the shopping list itself is for (`shopping-specialisation` lets the user edit / remove / adjust items post-generation) |
| Optional ingredient     | Optional lines (`recipe_lines.optional = 1`) are excluded from the shopping list                                                                                                                                  | Matches the cook-flow rule (`batch-model` / `fifo-consumption-ui` / `cook-solver`): optional lines never block / never produce shortfalls. Including them in shopping would over-order                                           |
| Substitution surfacing  | Generator does NOT use the substitution graph. `cook-solver`'s solver remains the surface for "could you cook with subs instead"                                                                                  | User-chosen "strict" path. Future PRD may add a "use subs to reduce buy list" toggle                                                                                                                                             |

## Risks

- **Tag taxonomy drift** — Free-form tags fragment ("store-section:produce" vs "store-section:Produce" vs "store-section:fruits-and-veg"). Mitigation: `store-section-taxonomy` normalises on insert (lowercase, trim) and `data-page`'s tag picker offers an autocomplete from existing values. Curation UI (merge tags) deferred.
- **Missing section tags = noisy "Other" section** — Early in adoption, most ingredients have no section tag. Mitigation: `plan-shopping-generator`'s preview includes a count "<N items uncategorised>"; clicking opens `store-section-taxonomy`'s tag CRUD with the affected ingredients pre-filtered.
- **Pantry subtraction misses unit mismatches** — A recipe needs 200g banana; user has a count of bananas in the fridge. Strict subtraction doesn't reduce. Mitigation: `plan-shopping-generator`'s preview surfaces this with a "no match" hint per line so the user understands why they're being asked to buy more.
- **Plan changes between generation and shopping** — User generates list Sunday; edits plan Tuesday. List is stale. Mitigation: list metadata (in `notes`) records the source plan-window dates. UI surfaces "Generated <N days ago" so the user knows it may not reflect the current plan.
- **Recipe with non-current version pinned in the plan** — `plan_entries.recipe_version_id` may pin an older version. Generator must respect the pin (matches `plan-entry-model`'s rule). Tests pin this.
- **Cycle: ingredient with multiple section tags renders only one section** — If "olive oil" tags as both `store-section:pantry` and `store-section:condiments`, the generator picks one (alphabetical first). Mitigation: `store-section-taxonomy` documents the picking rule; future PRD adds explicit per-ingredient "primary section" override if user demand emerges.

## Out of Scope

- Explicit section headers in the shopping list UI (e.g. "── PRODUCE ──" dividers between groups) — deferred; v1 relies on ordering alone.
- Substitution-aware subtraction — user-rejected option; `cook-solver`'s solver still surfaces "you could cook with subs instead".
- Recurring / template shopping lists — deferred.
- Multi-store shopping (different aisles for Trader Joe's vs Costco) — deferred.
- Receipt scanning to auto-tag ingredients with sections — out of scope (cross-domain with finance theme).
- Tag-based recipe discovery ("show me vegan recipes") — out of scope; `ingredient_tags` schema enables it but no UI in this epic.
- Tag merging / canonicalisation UI — deferred. Curation is manual via `store-section-taxonomy`'s CRUD.
- Estimated cost per item — deferred (cross-domain with finance).
- Aisle / store-layout customisation (user reorders sections to match their store's layout) — deferred. Default section ordering is alphabetical; user feedback may justify per-user override later.
- Multi-currency / international supermarket support — out of scope.
- Voice input for adding section tags — theme-level decision.
