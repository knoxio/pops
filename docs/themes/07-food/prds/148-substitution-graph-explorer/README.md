# PRD-148: Substitution Graph Explorer

> Epic: [06 — Substitutions & Solver](../../epics/06-substitutions.md)

## Overview

A visual node-edge view of the `substitutions` graph (PRD-109) at `/food/data/substitutions/graph`, complementing PRD-122's flat-tab CRUD. Read-only. Force-directed layout for the full graph; radial-by-node layout when the user focuses one ingredient. Click a node → side-panel lists incoming + outgoing edges with ratio, context tags, and scope (global vs per-recipe). Click an edge → drill into its detail card.

After this PRD, the user can answer "what subs for butter? what does butter sub for? are there cycles I introduced by mistake?" by looking at a picture instead of scrolling PRD-122's table. CRUD stays in PRD-122; this PRD is purely a visualisation layer.

This is the smallest PRD in Epic 06 — pure UI on top of a query the substitutions router already exposes.

## Route

| Path                                         | Page           | Purpose                                                                |
| -------------------------------------------- | -------------- | ---------------------------------------------------------------------- |
| `/food/data/substitutions/graph`             | `SubGraphPage` | Force-directed view of every substitution edge                         |
| `/food/data/substitutions/graph?node=<slug>` | `SubGraphPage` | Radial-focused view on one ingredient or variant slug                  |
| `/food/data/substitutions/graph?edge=<id>`   | `SubGraphPage` | Same view; opens the edge detail side-panel for the given substitution |

A "View as graph" button in PRD-122's Substitutions tab links here. A "View as table" button in this page's header links back to `/food/data/substitutions`.

## Page layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ Substitution graph                              [View as table]      │
├─────────────────────────────────────────────────────────────────────┤
│  Scope: [ ● Global    ○ Recipe: pick one ▼ ]                        │
│  Context: [ All tags ▼ ]   Filter: [ search... ]                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│         butter ●─────► olive-oil                                     │
│           │           ratio 0.75                                      │
│           │           savory, frying                                  │
│           ▼                                                            │
│         coconut-oil ─────► butter                                    │
│           (radial focus on butter shows all subs)                    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Header controls

- **Scope toggle**: Global (default) shows only `scope='global'` edges. Recipe shows recipe-scoped edges; the dropdown picks which recipe.
- **Context tag filter**: dropdown with every distinct tag observed in the data + "All". Filters edges by `EXISTS (SELECT 1 FROM json_each(context_tags) WHERE value = :tag)` — matches PRD-109's JSON-array semantics. (A naive `LIKE %tag%` would false-positive: `"savory"` would match `"unsavory"`.)
- **Search**: filters nodes by ingredient / variant slug.

### Graph body

Two layouts, picked by URL:

#### Global view (force-directed)

- Nodes: every ingredient or variant that appears in at least one substitution row (as `from` or `to`).
- Edges: every substitution row matching the current Scope + Context filters.
- Node colour: ingredient = grey, variant = blue. Hover shows the slug + name.
- Edge style: solid arrow for `scope='global'`; dashed for `scope='recipe'` (rendered only when the recipe scope is selected). Edge thickness scales with ratio (1.0 = standard; 0.5 or 2.0 = thicker → user-visible "non-trivial" sub).
- Layout: force-directed via `react-force-graph-2d`. Initial layout computed once; user can drag nodes.
- Library: `react-force-graph-2d` is the v1 pick — small, no WebGL needed for the expected graph size (<500 nodes). Dependency declaration (not currently in any package.json): added to `packages/app-food/package.json` during this PRD's implementation; AC includes the install step.

#### Radial node-focused view (`?node=<slug>`)

- Centre node is the selected ingredient or variant.
- Outgoing edges fan out to the right; incoming edges fan in from the left.
- Sorted radially by ratio (closer to 1.0 = closer to the centre).
- Edge labels: "→ olive-oil (0.75, savory)".

### Side panel — node detail

Opens on node click:

- **Slug + name** of the focused entity.
- **Incoming subs**: "These substitute for X — N items" — list of edges where this entity is the `to` side.
- **Outgoing subs**: "X substitutes for these — N items" — list of edges where this entity is the `from` side.
- Each list row: `<from-or-to> (ratio, context tags, scope)`. Click → edge detail.

### Side panel — edge detail

Opens on edge click:

- **From → To** (clickable to focus either node).
- **Ratio**: numeric + verbal interpretation ("Use 0.75 cups olive oil for every 1 cup butter").
- **Context tags**: chip list.
- **Scope**: Global / Recipe (with link to the recipe if scoped).
- **Notes**: from `substitutions.notes`.
- **Edit / Delete**: links to PRD-122's table-row editor (graph explorer is read-only; mutation is owned by PRD-122). Click navigates to `/food/data/substitutions?focus=<edgeId>`.

## tRPC API

```ts
// apps/pops-api/src/modules/food/router.ts (extends; food module)
food.substitutions.graphView: query({
  input: {
    scope?: 'global' | 'recipe',
    recipeId?: number,                          // required when scope='recipe'
    contextTag?: string,                        // filter to edges that include this tag (or no tags)
    search?: string,                            // node slug / name substring
  },
  output: GraphView,
});

export type GraphView = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type GraphNode = {
  id: string;                                   // composite: "ingredient:<id>" or "variant:<id>"
  kind: 'ingredient' | 'variant';
  ingredientId: number;
  variantId: number | null;
  ingredientSlug: string;
  ingredientName: string;
  variantSlug: string | null;
  variantName: string | null;
};

export type GraphEdge = {
  id: number;                                   // substitutions.id
  fromNodeId: string;
  toNodeId: string;
  ratio: number;
  contextTags: string[];
  scope: 'global' | 'recipe';
  recipeId: number | null;
  recipeSlug: string | null;                    // resolved when scope='recipe'
  notes: string | null;
};
```

The query returns `nodes` and `edges` in one round-trip. Nodes are computed server-side from the set of `from`/`to` entities present in the filtered edges; the response is the minimum spanning subgraph for the current filters.

`contextTag` filter: an edge matches if its `context_tags` JSON array contains the requested tag OR if the array is empty (which PRD-109 treats as wildcard). Implementation uses `json_each(context_tags)` per PRD-122's existing pattern for the same column.

**Scope filter performance note**: PRD-109's `idx_subs_scope_recipe` is partial on `scope='recipe'` only — there is no covering index for `scope='global'`. Global-view queries therefore full-scan the `substitutions` table. Acceptable at the expected scale (<500 edges); revisit if scale grows.

## Components

```
packages/app-food/src/pages/data/substitutions-graph/
├── SubGraphPage.tsx
├── ForceGraphCanvas.tsx                       // wraps react-force-graph-2d
├── RadialFocusView.tsx                        // for ?node= variant
├── SubGraphHeader.tsx                         // scope toggle + context filter + search
├── NodeDetailPanel.tsx
└── EdgeDetailPanel.tsx
```

State management is local React state; no Redux / Zustand. Page reads URL params, queries `food.substitutions.graphView`, renders.

## Business Rules

- The page is **read-only**. Edge/node mutations always link back to PRD-122's CRUD tab.
- Default scope is `global`. Recipe scope requires a recipe selection (dropdown loads from `food.recipes.list`).
- Filters compose: scope + context tag + search are all ANDed.
- Empty result state: "No substitutions match your filters." with a "Clear filters" link.
- Search matches ingredient name OR variant name OR slug (case-insensitive substring; debounced 200ms).
- Nodes with zero matching edges after filters are excluded from the rendered graph (minimum spanning subgraph).
- Edge thickness scaling: ratio in [0.5, 2.0] maps to base thickness; ratio outside that range maps to maximum thickness. Cosmetic only.
- Polling is NOT enabled — the substitution graph changes rarely; user manually re-fetches on tab focus or via a refresh button.

## Edge Cases

| Case                                                                    | Behaviour                                                                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Substitution graph has 500+ edges                                       | Force-directed layout still renders in <2s; user drags-to-explore. v1 doesn't paginate; future PRD if scale grows. |
| User selects scope='recipe' with no recipe picked                       | Page shows an empty state: "Pick a recipe to see its overrides."                                                   |
| Edge has `ratio=0` (shouldn't be possible per PRD-109 CHECK; defensive) | Render with thickness=1; show ratio as "0 (invalid)" in the side panel.                                            |
| Context-tag filter matches no edges                                     | Empty-state message + Clear filters link.                                                                          |
| Click a node that no longer exists (URL stale)                          | Side panel shows "Node not found"; suggest opening the table view.                                                 |
| User clicks Edit in the side panel and PRD-122's tab opens              | Existing PRD-122 flow handles it; on return to graph, page re-fetches.                                             |
| Radial view on a slug that has 0 in-edges or 0 out-edges                | Shows only the half that has edges; the other side displays "No incoming subs" / "No outgoing subs".               |
| User searches for a slug with non-ASCII chars                           | Substring match works (SQLite LIKE handles UTF-8 if encoding is UTF-8; verify with a test case).                   |
| Two edges between the same nodes (one global, one recipe-scoped)        | Both rendered; line style distinguishes (solid global, dashed recipe). Side panel shows them in separate sections. |
| User mid-drag while a poll re-fetches                                   | Polling disabled per business rules; not an issue. Manual refresh button is the only re-fetch path.                |
| User clicks a node that points at a deleted ingredient (rare race)      | Defensively: if `ingredients.id` no longer resolves, render the slug from cache + a "(deleted)" tag.               |

## Acceptance Criteria

Inline per theme protocol.

### Routes & shell

- [x] `/food/data/substitutions/graph` registered as a route in PRD-122's substitutions tab area (sub-route).
- [ ] PRD-122's Substitutions tab gains a "View as graph" button linking here. **Deferred to PRD-122-D** — the tab is still PRD-122-A's `TabPlaceholder`; adding the link here would conflict with PRD-122-D's tab rewrite.
- [x] `?node=<slug>` switches to radial focus view.
- [x] `?edge=<id>` opens the edge detail side-panel on initial load.

### Graph rendering

- [x] `react-force-graph-2d` added to `packages/app-food/package.json` (or sub-package's deps where the explorer lives) at install time.
- [ ] Force-directed layout renders 500-node graphs in <2 seconds initial layout (matching the edge-case timing claim). **Not benchmarked** — the seed (PRD-113) has ~10 subs. Capability stated; revisit when scale matters.
- [x] Node colour distinguishes ingredient vs variant.
- [x] Edge style distinguishes global (solid) vs recipe-scoped (dashed).
- [x] Edge thickness scales by ratio in `[0.5, 2.0]` range; outside that range clamps to max.
- [x] Radial view fans incoming left / outgoing right around the focused node.

### Side panels

- [x] Node detail panel lists incoming + outgoing subs separately with counts.
- [x] Edge detail panel shows ratio, context tags, scope, recipe link (if scoped), notes.
- [x] Edit / Delete in edge panel link back to PRD-122 with `?focus=<edgeId>`.

### Filtering

- [x] Scope toggle switches between global / recipe-scoped.
- [ ] Recipe-scope requires a recipe pick (dropdown). **Deferred to PRD-119** (`food.recipes.list`). Scope toggle currently shows an empty-state placeholder when `scope=recipe` is selected; the wire-level `recipeId` filter is implemented + tested so the picker is a single-prop change once PRD-119 lands.
- [x] Context-tag filter applies via `json_each`.
- [x] Search filters by slug + name (case-insensitive substring, debounced). 200ms debounce via `useDebouncedValue` from `@pops/ui`.

### tRPC

- [x] `food.substitutions.graphView` returns `GraphView` matching the schema; one round-trip.
- [x] Filter combinations produce a single SQL query (no N+1). Four bounded `SELECT`s (filtered substitutions + ingredients/variants/recipes by `IN` set); never per-edge fanout.

### Tests

- [x] Vitest + RTL at `packages/app-food/src/pages/data/substitutions-graph/__tests__/SubGraphPage.test.tsx`:
  - Graph renders nodes + edges from a seeded fixture.
  - Filter combinations narrow correctly.
  - Side panel opens on node + edge click.
- [x] Vitest integration at `apps/pops-api/src/modules/food/__tests__/substitutions-graph.test.ts`:
  - `graphView` returns minimum spanning subgraph for the filter.
  - Empty filters return the full global graph.

## Out of Scope

- CRUD (add / edit / delete edges) — **PRD-122**.
- 3D / WebGL rendering — out of scope; 2D canvas is enough.
- Multi-hop chain visualisation (A→B→C) — out of scope (PRD-109 forbids transitive).
- Diff view between snapshots of the graph at different times — out of scope.
- Saved layout positions — out of scope; force-directed re-computes per page load.
- Animated transitions between filter states — out of scope; static re-render.
- Print / export of the graph — out of scope.
- Filter by recipe context tags directly (cross-reference with `recipe_tags`) — out of scope.
- LLM-suggested missing edges ("did you mean to add olive-oil → coconut-oil?") — out of scope.

## Requires (cross-PRD dependencies)

- **PRD-106** — `ingredients` / `ingredient_variants` schema (names, slugs).
- **PRD-107** — `recipes.slug` for recipe-scoped edges.
- **PRD-109** — `substitutions` schema + the existing CRUD pattern.
- **PRD-118** — `app-food` shell module.
- **PRD-122** — Substitutions tab in `/food/data` (this PRD adds a sibling sub-route).
