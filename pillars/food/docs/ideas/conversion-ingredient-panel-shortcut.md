# Idea: "Add weight" shortcut from the ingredient detail panel

**Status: not built.** The conversion tables, REST surface, seed, and the standalone Conversions admin tab all ship (see `prds/conversion-table`). What is missing is the cross-PRD convenience link: a way to jump straight from an ingredient into adding a weight for it.

## What to build

On the ingredient detail panel (`app/src/pages/data/ingredients-tab/IngredientDetailPanel.tsx`) add an **"Add weight"** action that opens the ingredient-weights create form pre-scoped to that ingredient — either by navigating to `/food/data/conversions` with the ingredient pre-selected (and the create dialog open) or by mounting the existing `CreateWeightDialog` inline with `ingredientId` pre-filled.

Today the panel has no reference to weights or conversions at all; the only entry point is the Conversions tab's own "Add" button, which starts from an empty ingredient picker.

## Why it was deferred

It touches `IngredientDetailPanel`, which is also amended by the ingredient-panel work in `prds/data-page`. The two were kept off the same in-flight branch to avoid simultaneous edits to the same component. Land it once the panel work settles.

## Acceptance sketch

- An "Add weight" button on the ingredient detail panel opens the weight-create form with the current ingredient pre-selected (picker disabled or pre-filled).
- Submitting creates an `ingredient_weights` row for that ingredient via `POST /conversions/weights` and the Conversions tab reflects it.
- The variant picker still lets the user choose "any" or a specific variant.
