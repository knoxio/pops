# Epic 06: Substitutions & Solver

> Theme: [Food](../README.md)

## Scope

Layer the substitution graph from PRD-109 onto the cooking and discovery surfaces. A visual graph explorer (`/food/data/substitutions/graph`) that complements PRD-122's flat-tab CRUD; cook-time substitution suggestions inlined into PRD-146's batch-override picker; a "what can I cook tonight?" solver at `/food/solve` that walks every recipe against the current fridge + the substitution graph and returns a ranked list of cookable recipes.

After this epic, when the user runs out of butter at cook time, the override picker shows "Olive oil (3/4 cup) — global substitution" alongside the same-variant batches. When the user opens `/food/solve` on Tuesday night with what's in the fridge, they see a list of cookable recipes sorted by fewest-substitutions-needed, with one-click navigation to start cooking.

This epic is **strictly read-only against the substitution graph** — CRUD lives in PRD-122. PRD-148 adds a visual layer over the same data; PRDs 149-150 consume the graph at cook / discovery time.

## PRDs

| #   | PRD                                                                                 | Summary                                                                                                                  | Status      |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------- |
| 148 | [Substitution Graph Explorer](../prds/148-substitution-graph-explorer/README.md)    | `/food/data/substitutions/graph` — visual node-edge view; click a node → see all incoming/outgoing subs                  | Partial     |
| 149 | [Cook-Time Substitution Suggestions](../prds/149-cook-time-substitutions/README.md) | PRD-146 amendment — batch-override picker splits into Same-variant / Substitutions sections; ranks by ratio fit + expiry | Not started |
| 150 | [What-Can-I-Cook Solver](../prds/150-cook-solver/README.md)                         | `/food/solve` page; deterministic cookable+ranking; consumes PRD-109 graph + PRD-108 batches; fridge-view entry button   | Not started |

### Build order

```
148 ──► (independent — visualisation only)
150 ──► 149  (PRD-150 owns the shared service file; PRD-149 imports it)
```

PRD-148 is independent — pure visualisation over PRD-109 + PRD-122's existing CRUD. PRD-150 must land before PRD-149 because PRD-150 owns the shared substitution-resolution service file at `apps/pops-api/src/modules/food/services/substitutions-resolve.ts`; PRD-149's public `food.substitutions.resolveForLine` tRPC procedure imports and wraps it. (The contract is independent, but the file-ownership chain is sequential.)

## Dependencies

- **Requires:** PRD-109 (`substitutions` schema + indexes + UNIQUE constraints + service-layer rules).
- **Requires:** PRD-122 (Substitutions tab in `/food/data`; the graph explorer mounts as a sibling route).
- **Requires:** PRD-108 (`batches` + `consumeForRun`) — PRD-150's solver walks recipe_lines against current batches.
- **Requires:** PRD-116 (`recipe_lines.variant_id`, `prep_state_id`, canonical qty columns) — solver reads.
- **Requires:** PRD-146 (cook modal batch-override picker) — PRD-149 amends.
- **Requires:** PRD-147 (`/food/fridge` page) — PRD-150 adds an entry button.
- **Unlocks:** Better cook-time UX (less manual searching for what subs for what) and a discovery surface (the solver) that pairs naturally with Epic 05's fridge view.

## Key Decisions

| Decision                      | Choice                                                                                                                                                                                              | Rationale                                                                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Substitution chaining         | Single-hop only — PRD-109's existing rule. PRD-150 does NOT walk A→B→C transitively                                                                                                                 | Keeps the solver bounded and predictable; chains rapidly explode into nonsense ("butter → olive oil → sesame oil → tahini" is not a real recipe path). User picks one substitution at cook time |
| Substitution surface at cook  | Inline in PRD-146's batch-override picker — picker dropdown split into "Same variant" and "Substitutions" sections                                                                                  | Unifies resolution into one widget; no extra panel to teach. Substitutions become first-class without ballooning the modal                                                                      |
| Sub ranking inside the picker | Ratio match (1.0 first) → context-tag overlap with the recipe's tags → expiry of the candidate's batch (sooner = higher rank inside this section)                                                   | Cheapest substitution UX = "the one that's a near-identity replacement with stock that's about to expire". Score is local to the picker; not the solver's binary cookable signal                |
| Solver answer shape           | Binary `canCook` per recipe (true iff every required line is satisfied by FIFO OR by a valid substitution). Rank by `# subs needed ASC, last_cooked_at DESC`                                        | User chose binary semantics over expiry-boosted ranking. Cleaner contract; the fridge view's expiry pressure surfaces elsewhere. PRD-150 has no half-credit "partially cookable" tier in v1     |
| Solver entry points           | Dedicated `/food/solve` page + a "What can I cook?" button in `/food/fridge` header. Plan grid / recipe list / homepage left untouched                                                              | Concentrates the solver in one canonical place; fridge-view button is the high-context entry ("I'm staring at my pantry — what now?"). Avoids per-surface integration tax                       |
| Expiry boost on solver        | NOT applied. The solver scores cookable vs not-cookable, no expiry weighting                                                                                                                        | User-selected; aligns with "binary answer". Future PRD may add a separate "Use up expiring" tab if real demand emerges                                                                          |
| Solver clicking 'Cook this'   | Jumps to `/food/recipes/:slug` — does NOT pre-commit substitutions or open the cook modal directly. The regular cook flow (PRD-144 + PRD-149's amendments to PRD-146) takes over                    | Solver suggests; cook flow commits. Two-step lets the user double-check on the recipe page before locking in substitution choices                                                               |
| Graph explorer scope          | Visual node-edge layout over `substitutions`; no CRUD inside the visualiser (CRUD stays in PRD-122's flat tab). Click a node → see incoming + outgoing edges in a side-panel; click an edge → drill | Visualisation is read-only and informational; mixing CRUD into a force-directed graph is implementation drag. CRUD has a perfectly good home in PRD-122's table view                            |
| Graph layout                  | Force-directed for the global graph view; radial-by-ingredient for the "node-focused" detail view                                                                                                   | Force-directed is the default for substitution-style "nearby" relationships; radial focuses cleanly on a single ingredient and its subs                                                         |
| Solver candidate set          | All non-archived recipes with `current_version_id IS NOT NULL` AND `compile_status='compiled'`. Draft-only recipes excluded                                                                         | A draft can't be cooked through the standard path (PRD-108 rule); solver should only surface real options                                                                                       |
| Solver caching                | Server computes on demand per call; no cache. Re-runs on every `/food/solve` query                                                                                                                  | Cook events are bursty (a few per day at most); recipe count is bounded. Cheap to recompute; caching would invalidate on every batch change                                                     |
| Service ownership             | New `food.substitutions.*` router (sibling of `food.batches.*` / `food.recipes.*`); read-only queries only. PRD-122's existing CRUD lives on its own router and is untouched                        | Single-responsibility router boundaries; read paths are cleaner without write paths                                                                                                             |

## Risks

- **Solver performance with many recipes** — N recipes × M lines each × ~10 sub-edges per line = N×M×10 lookups. At N=500, M=12, that's ~60k row reads. SQLite handles this in <100ms with the existing indexes. Mitigation: profile with seeded data ≥ 500 recipes; defer caching to v2.
- **Substitution graph confusion** — Directed edges with per-recipe overrides can be hard to reason about. Mitigation: PRD-148's explorer surfaces the resolution order explicitly ("for recipe X, this edge wins over the global one because…"); PRD-122 already documents the rule.
- **Picker dropdown clutter** — PRD-146's picker now has two sections; if a popular ingredient has 20+ substitutions defined, the picker becomes a wall. Mitigation: PRD-149 caps the suggested list at 5; clicking "Show all" expands.
- **Stale substitutions in cook history** — A cook on Tuesday recorded "used olive oil for butter"; user later edits the substitution graph. The historical `batch_consumptions` row still points at the actual batch consumed, so history is preserved. The only risk is the explorer rendering inconsistent state mid-edit — handled by React Query invalidation.
- **Solver false positives via subs** — Solver says "cookable with subs" but a substitution that's globally valid may be locally wrong for this recipe context. Mitigation: PRD-150 filters by `context_tags` against the recipe's tags. If the recipe is `savory` and a sub is tagged `sweet`, it's excluded; if the sub has no tags, it applies anywhere (PRD-109 rule).
- **Two recipes that share the same substitution-required path** — Solver's # subs needed counts each line independently. Recipe A needing 3 subs and recipe B needing 1 sub are very different even if they share the same ingredient gaps. Mitigation: ranking is correct (1 < 3); ordering favours cleaner cooks.

## Out of Scope

- Multi-hop substitution chains (A→B→C) — explicit PRD-109 rule.
- Substitution suggestions from cook history or ML — deferred.
- Substitution chip rendering inside PRD-121's recipe renderer (e.g. "tap to swap" on an ingredient line in the recipe body) — out of scope.
- Per-pantry inventory levels in the cook-time picker beyond what PRD-146 already shows — out of scope.
- "Recipe similarity" search — out of scope.
- Auto-applied substitutions (one-click "cook with substitutions") — solver suggests; cook flow commits. No auto-execute.
- Solver suggestions weighted by user rating history (recipe with rating=5 ranks higher than rating=2) — deferred; future PRD if rating data accumulates.
- Solver across user-defined dietary filters ("vegan tonight", "no nuts") — deferred; could be a context-tag filter applied to the candidate set.
- A "weekly meal plan from the pantry" auto-generator — out of scope; the solver is per-query, not plan-shaped.
- Substitution graph importer/exporter — out of scope.
- LLM-generated substitution suggestions — out of scope.
