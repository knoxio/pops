# Solver tag filter backed by a real tag taxonomy

The `/food/solve` tags filter (`SolveFilters`) currently takes a raw comma-separated text input the user types by hand. The server side already supports a structured `tags: string[]` AND-filter, so the gap is purely in the UI: there is no distinct-tags surface to populate a multi-select.

When a recipe-tag taxonomy surface lands (a `food.recipes.distinctTags`-style read returning the set of tags actually in use), replace the free-text input with a multi-select chip group matching the recipe-type chips already in `SolveFilters`. That removes the typo failure mode (a misspelled tag silently matches nothing) and lets the user discover which tags exist. Wire it to the existing `tags` body field — no server change needed.

A natural extension once the taxonomy exists: a dietary filter ("vegan tonight") layered on top of the tag set, so the solver can answer "what can I cook that fits this diet" rather than only "what can I cook". That needs a diet tag schema first and is out of scope until one emerges.
