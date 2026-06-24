# Idea: Substitution graph explorer extensions

Forward-looking work deliberately excluded from the shipped [substitution-graph-explorer](../prds/substitution-graph-explorer/README.md). The read-only force-directed / radial visualisation, both side panels, and the `GET /food/substitutions/graph-view` projection are done; these are the next layers.

## Recipe-scope picker

The scope toggle exposes `global` and `recipe`, and the wire-level `recipeId` filter is implemented end-to-end (the `graph-view` query accepts it, the db service filters on it). What is missing is the UI dropdown to _pick_ which recipe — selecting `scope=recipe` currently renders a placeholder ("recipe picker pending"). The picker is a single-prop change once a `GET /food/recipes` list endpoint suitable for a lightweight slug/name dropdown is available. When wired: the dropdown loads recipes, the radial/force views render the recipe's overrides (dashed edges), and the empty state becomes "Pick a recipe to see its overrides."

## "View as graph" entry point from the table

The Substitutions table tab (`/food/data/substitutions`) has no "View as graph" button linking to the explorer; today the only way in is a direct URL. Add a button in the table header that links to `/food/data/substitutions/graph`, preserving the inverse of the explorer's existing "View as table" link.

## Layout performance at scale

The force-directed canvas is unbenchmarked beyond the seed's handful of edges. The stated target is a 500-node graph laying out in under 2 seconds; verify with a synthetic large fixture and add pagination / level-of-detail culling if it regresses. Global-view queries currently full-scan `substitutions` (the `scope='recipe'` partial index does not cover `global`); add a covering index if edge count grows past the low-hundreds.

## Saved layouts and richer interaction

The force layout recomputes on every page load — node positions are not persisted. A future version could save per-user layout positions, animate transitions between filter states, and offer print / PNG export of the current view.

## Cross-reference and discovery features

- Filter the graph by recipe context tags by cross-referencing recipe-level tag metadata, not just per-edge `context_tags`.
- LLM-suggested missing edges ("did you mean olive-oil → coconut-oil?") surfaced as ghost edges the user can accept into the CRUD table.
- Diff view between snapshots of the graph at two points in time, to review how the substitution set evolved.
