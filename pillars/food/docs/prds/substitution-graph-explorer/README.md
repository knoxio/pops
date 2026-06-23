# Substitution Graph Explorer

Status: Partial — the read-only visualisation, both side panels, and the graph-view projection ship. The recipe-scope picker and the "View as graph" entry point from the table tab are deferred ([ideas](../../ideas/substitution-graph-explorer-extensions.md)).

A read-only node-edge view of the substitution graph at `/food/data/substitutions/graph`, complementing the flat table CRUD. The user answers "what subs for butter? what does butter sub for? are there cycles I introduced by mistake?" by looking at a picture instead of scrolling the table. CRUD (add/edit/delete edges) stays in the Substitutions table tab; this is purely a visualisation layer over a single graph-view query the substitutions contract exposes.

## Routes

| Path                                         | Page           | Purpose                                                     |
| -------------------------------------------- | -------------- | ----------------------------------------------------------- |
| `/food/data/substitutions/graph`             | `SubGraphPage` | Force-directed view of every substitution edge              |
| `/food/data/substitutions/graph?node=<slug>` | `SubGraphPage` | Radial-focused view on one ingredient or variant slug       |
| `/food/data/substitutions/graph?edge=<id>`   | `SubGraphPage` | Same view; opens the edge detail side-panel on initial load |

The route is registered as a sibling under `data` (not nested under `substitutions`) so the data-layout active-tab resolver keeps the Substitutions tab highlighted while the graph subroute is open. A "View as table" button in this page's header links back to `/food/data/substitutions`.

## REST API

The frontend reads the food pillar's generated typed client (`app/src/food-api`, projected from the pillar's OpenAPI by `@hey-api/openapi-ts`) against the substitutions contract:

```
GET /food/substitutions/graph-view
  query: { scope?: 'global' | 'recipe', recipeId?: int>0, contextTag?: string, search?: string }
  200: { nodes: GraphViewNode[], edges: GraphViewEdge[] }
  errors: standard error envelope (400/404/...)
```

```ts
GraphViewNode = {
  id: string;            // composite "ingredient:<id>" or "variant:<id>"
  kind: 'ingredient' | 'variant';
  ingredientId: number;
  variantId: number | null;
  ingredientSlug: string;
  ingredientName: string;
  variantSlug: string | null;
  variantName: string | null;
};

GraphViewEdge = {
  id: number;            // substitution row id
  fromNodeId: string;
  toNodeId: string;
  ratio: number;
  contextTags: string[];
  scope: 'global' | 'recipe';
  recipeId: number | null;
  recipeSlug: string | null;  // resolved when scope='recipe'
  notes: string | null;
};
```

One round-trip returns both arrays. Nodes are the **minimum spanning subgraph**: the db service derives them server-side from the `from`/`to` sides of the filtered edges, deduped by composite id. Edge hydration is bounded — fetch the filtered substitutions, then resolve ingredients / variants / recipes by `IN`-set (never per-edge fanout).

- `contextTag` filter matches an edge when its `context_tags` JSON array contains the tag **or** is empty (empty = wildcard). Implemented with `json_each(context_tags)` plus a `json_array_length(...) = 0` clause — not a `LIKE %tag%`, which would false-positive (`savory` matching `unsavory`).
- `scope` defaults to `global`. `scope='recipe'` requires `recipeId`; the db service throws if it is missing (the contract boundary also refuses it) so a bare recipe scope can never leak every recipe's edges.
- `search` is applied in TypeScript over the hydrated slugs and names (case-insensitive substring), keeping the SQL simple at the expected scale.

## Page layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ Substitution graph                       [Refresh]  [View as table]  │
├─────────────────────────────────────────────────────────────────────┤
│  Scope: ( ● Global   ○ Recipe )   Context: [ All tags ▼ ]  [search]  │
├─────────────────────────────────────────────────────────────────────┤
│        butter ●─────► olive-oil          │  Node / edge detail panel │
│          ratio 0.75 · savory, frying      │  (opens on click)         │
└─────────────────────────────────────────────────────────────────────┘
```

**Header controls:** Refresh button (manual re-fetch), "View as table" link, scope radios (global / recipe), context-tag dropdown (distinct tags observed in the current view's edges + "All"), and a debounced search box (200ms via `useDebouncedValue`). All header state lives in URL search params (`scope`, `contextTag`, `q`, `node`, `edge`) so views are shareable and back-navigable; the debounce flow guards against a stale fire re-pushing a pre-clear value.

**Graph body — two layouts, picked by URL:**

- _Global (force-directed):_ `react-force-graph-2d` canvas. Node colour: ingredient = grey, variant = blue. Edge style: solid for `scope='global'`, dashed for `scope='recipe'`; directional arrows; thickness scales by ratio. A `renderImpl` prop lets tests substitute a deterministic DOM renderer so vitest needs no real `HTMLCanvasElement`.
- _Radial (`?node=<slug>`):_ pure-SVG layout centred on the focused node; outgoing edges fan right, incoming fan left, each side sorted by ratio distance from 1.0 (closest to 1.0 nearest the centre). Clicking a spoke selects the edge; clicking a satellite node refocuses.

**Side panels:**

- _Node detail_ (node click): focused entity's label, an "incoming subs" list (edges where it is `to`) and an "outgoing subs" list (edges where it is `from`), each with a count. Rows click through to edge detail.
- _Edge detail_ (edge click): from → to (each clickable to refocus), ratio with a verbal interpretation, context-tag chips, scope (+ recipe slug if scoped), notes, and an "Edit in table view" link to `/food/data/substitutions?focus=<edgeId>`.

## Business rules

- The page is **read-only**. Every mutation affordance links back to the Substitutions table tab; the graph never writes.
- Filters compose (scope AND context-tag AND search). Nodes with zero matching edges are excluded (minimum spanning subgraph).
- Search matches ingredient name OR variant name OR slug, case-insensitive substring, debounced 200ms.
- Edge thickness is cosmetic: ratio in `[0.5, 2.0]` → normal (2px); ratio outside that band → thick (4px); non-finite / `≤ 0` ratio → thin (1px).
- Polling is disabled; the user re-fetches via the Refresh button (the graph changes rarely).
- Context-tag dropdown is populated from the distinct tags present in the _current_ view, sorted.

## Edge cases

| Case                                                                | Behaviour                                                                                             |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| No edges match the filters                                          | Empty state: "No substitutions match your filters." + a "Clear filters" button resetting every param. |
| `scope='recipe'` with no recipe picked                              | Query is skipped; a placeholder explains the recipe picker is pending (see ideas).                    |
| `?node=<slug>` resolves to no node in the current view              | Side panel shows "Node not found" + a hint to open the table view.                                    |
| Edge with non-finite or `≤ 0` ratio (CHECK drift, defensive)        | Thin line; the edge panel renders the ratio as "(invalid)" instead of a verbal interpretation.        |
| Two edges between the same nodes (one global, one recipe)           | Both render; line style distinguishes them (solid vs dashed); side panel lists them separately.       |
| Radial focus on a node with 0 in- or 0 out-edges                    | Only the populated side renders; the empty side is simply absent.                                     |
| Non-ASCII search term                                               | Substring match works (UTF-8).                                                                        |
| FK drift — edge side references a missing ingredient/variant/recipe | Hydration throws with a precise message naming the orphaned id rather than coercing to a bogus node.  |

## Acceptance criteria

### Routes and shell

- [x] `/food/data/substitutions/graph` registered as a sibling sub-route under `data`; the Substitutions tab stays highlighted while it is open.
- [x] `?node=<slug>` switches to the radial focus view (accepts both `parent:variant` and bare `ingredient` slug forms).
- [x] `?edge=<id>` opens the edge detail side-panel on initial load.
- [x] Header "View as table" links back to `/food/data/substitutions`.

### Graph rendering

- [x] `react-force-graph-2d` is a declared app dependency and renders the force-directed canvas.
- [x] Node colour distinguishes ingredient (grey) vs variant (blue).
- [x] Edge style distinguishes global (solid) vs recipe-scoped (dashed); directional arrows render.
- [x] Edge thickness scales by ratio: `[0.5, 2.0]` → 2px, outside → 4px, invalid → 1px.
- [x] Radial view fans outgoing right / incoming left, sorted by ratio distance from 1.0.

### Side panels

- [x] Node detail lists incoming + outgoing subs separately, each with a count; rows click through to edge detail.
- [x] Edge detail shows ratio (+ verbal), context-tag chips, scope, recipe slug if scoped, notes.
- [x] Edge detail "Edit in table view" links to `/food/data/substitutions?focus=<edgeId>`.
- [x] Clicking a from/to label in the edge panel refocuses that node.

### Filtering

- [x] Scope toggle switches global / recipe; `scope=recipe` without a recipe skips the query and shows a placeholder.
- [x] Context-tag filter applies via `json_each` + empty-array-wildcard semantics (server-side).
- [x] Search filters by slug + name, case-insensitive substring, debounced 200ms; a parent-driven (deep-link / clear) update cannot be echoed back by a stale debounce.

### Graph-view query

- [x] `GET /food/substitutions/graph-view` returns `{ nodes, edges }` matching the schema in one round-trip.
- [x] Nodes are the minimum spanning subgraph derived from the filtered edges, deduped by composite id.
- [x] Edge hydration is bounded (filtered substitutions + `IN`-set lookups), never per-edge fanout.
- [x] `scope='recipe'` without `recipeId` is rejected at both the contract boundary and the db service.

### Tests

- [x] Frontend (vitest + RTL) covers nodes/edges rendering from a fixture, filter narrowing, and side-panel open on node + edge click.
- [x] Backend (vitest) covers the graph-view projection (nodes + edges) over seeded substitutions.

## Deferred (see [ideas](../../ideas/substitution-graph-explorer-extensions.md))

- Recipe-scope **picker** dropdown (wire-level `recipeId` filter is built; the UI awaits a recipe-list endpoint).
- "View as graph" entry-point button in the Substitutions table tab.
- 500-node layout benchmark + covering index for `scope='global'`; saved layouts, animated transitions, print/export; recipe-context-tag cross-reference; LLM-suggested missing edges; time-snapshot diff view.
