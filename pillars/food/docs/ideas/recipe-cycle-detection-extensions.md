# Recipe Cycle Detection — Extensions (idea)

Forward-looking enhancements to the shipped recipe-graph cycle detector (`pillars/food/src/dsl/cycle.ts`). None of these are built; the detector today returns the first cycle found, walks the live graph fresh each compile, and reports cycles only as structured compile errors.

## Multi-cycle reporting

Today the detector returns the FIRST cycle found and stops. When a candidate has multiple independent recipe-ref edges that each close a cycle, only one is surfaced; the author fixes it, recompiles, and discovers the next. Collect ALL cycles in one pass and return them together so the author can fix them in a single edit. Requires changing `CycleResult` to carry a list and updating the compile-error JSON shape.

## Break-the-cycle suggestions

Beyond reporting the path, suggest how to break it — e.g. which edge to drop, or which recipe to inline rather than reference. Needs heuristics over the cycle path and the surrounding graph.

## UI cycle visualisation

Surface the cycle in the recipe editor: highlight the offending `@ingredient` block (the detector already returns `offendingBlockLoc`) and render the `pathSlugs` chain as a clickable trail. Lives in the food app editor surfaces, not the detector. This is the consumer of the structured `CycleDescription` the backend already produces.

## Reachability caching for large libraries

The detector runs an iterative DFS over the live graph on every compile — O(targets × reachable_nodes). For a personal library (~500 recipes) worst-case walks are sub-millisecond, so this is unnecessary today. For much larger libraries, precompute and cache a reachability index (recipe_id → set of reachable recipe_ids), invalidated on promote/archive, and answer cycle queries against the index instead of re-walking. Only worth doing if profiling shows the detector is a bottleneck.

## Ingredient-hierarchy cycles

Cycle detection in the `ingredients.parent_id` hierarchy is a separate concern from the recipe graph and is enforced at insert in the ingredient domain — out of scope for this detector, noted here only to mark the boundary.
