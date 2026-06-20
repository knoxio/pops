# ADR-022: Unified Recipe-as-Ingredient Model

## Status

Accepted — 2026-06-07

## Context

The food theme needs to model:

- Raw ingredients (chuck, onion, tomato)
- Components — cook-ahead items that get assembled into meals (smash patties, tomato salsa, roasted chicken meat)
- Plates — finished meals (the AU lot burger, a burrito bowl)
- Purchased prepared foods — a Coles roast chicken is, from any recipe's perspective, identical to one you roasted yourself

The naive shape is three tables: `ingredients`, `components`, `recipes`. That triples the substitution graph, the cost-rollup paths, the pantry queries, and the FIFO consumption logic. It also forces a brittle classification at insert time: is "tomato salsa" a component or a recipe? Is store-bought salsa an ingredient or a component? There is no clean answer because the questions are the wrong shape — _provenance_ is what differs (homemade vs purchased), not _kind_.

## Options Considered

| Option                                                         | Pros                                                                                                                                   | Cons                                                                                                                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Three tables (ingredient / component / recipe)**             | Familiar; mirrors how most existing recipe apps model the world                                                                        | Triples every query path; forces premature classification; provenance (homemade vs bought) becomes structural instead of metadata                                 |
| **Component as a tag on `recipes` only (no yield ingredient)** | Single table; tagging is cheap                                                                                                         | A tagged recipe can't be referenced as an ingredient line — breaks pantry math, breaks substitution                                                               |
| **Polymorphic recipe-line targets (ingredient OR component)**  | Keeps the "component" concept distinct while enabling reference                                                                        | Polymorphic FKs are a query smell; every join branches; cycle detection has to walk two graphs                                                                    |
| **Unified — every recipe yields an ingredient (chosen)**       | One graph; one query path; provenance lives on batches; cost rollup and substitution fall out for free; cookbook-teaching framing fits | Cycles become possible by construction (must be prevented); fuzzy boundary between "recipe" and "prep_state" needs a convention; soft `recipe_type` enum required |

## Decision

A single graph: every recipe yields exactly one canonical ingredient via `recipe_versions.yield_ingredient_id`. Other recipes use that yield as input via `recipe_lines.ingredient_id`. Provenance of a particular _unit_ of an ingredient — homemade, purchased, gifted — lives on the `batches` row, not on the ingredient row.

In schema terms (defined in detail across PRDs 106–108):

```
ingredients
   ▲                  ▲
   │                  │
recipe_lines        recipe_versions.yield_ingredient_id
   │                  │
   │ (used by)        │ (produced by)
   ▼                  ▼

ingredient_variants ◄── batches.variant_id
                         batches.source_type ∈ {purchase, recipe_run, gift, other}
                         batches.source_id   → recipe_runs.id | purchases.id | NULL
```

A _component_ is a recipe with `recipe_type='component'` whose yield ingredient is referenced as input by at least one other recipe. A _plate_ is a recipe with `recipe_type='plate'` whose yield is typically consumed directly. These distinctions are **soft enums for UX filtering only**; the schema enforces no structural difference between them. Reclassifying a recipe is a simple column update with no cascading consequences.

The boundary between "this is a recipe" and "this is a prep_state on a single ingredient" is convention, not schema:

> It's a recipe if (a) the output is ever stored as a batch, OR (b) heat or fermentation is applied, OR (c) more than one input ingredient is involved. Otherwise it's a prep_state.

So "caramelised onions" is a recipe (heat applied; output stored in jars). "Diced onion" is a prep_state (in-the-moment knife cut). Misclassification is recoverable — promote a prep_state to a recipe by creating the recipe and updating any references.

## Consequences

### Positive

- **One query path** for "what's in the fridge" regardless of how the ingredient got there.
- **One substitution graph**: edges between "burger patty" and any other variant work whether the patty was homemade or store-bought.
- **Provenance-aware cost rollup** is free: recipe cost = Σ ingredient costs where each ingredient's cost = the cheapest available batch (rolled up from constituent recipes vs purchased). Answers "is it cheaper to make patties or buy them at Woolies?" directly.
- **Shopping-list dedup** works across homemade and purchased sources.
- **Recursion is uniform**: `chuck → smash patties → burger patty → AU lot burger → lot burger` is just edges in one graph — same insert, same query, same FIFO consumption.
- **Cookbook framing fits**: every technique (stock, caramelised onions, demi-glace) is a first-class recipe with its own page, just like a plate.

### Negative

- **Cycles are possible by construction.** Recipe A could in principle reference Recipe A's output as input. Mitigation: cycle detection at compile time via PRD-117 (iterative DFS over the recipe ↔ yield ↔ recipe graph), invoked between resolve (PRD-115) and materialise (PRD-116). Self-reference is caught earlier in the resolver with a clearer error.
- **Prep_state vs recipe boundary is fuzzy.** The convention above is judgement-dependent. Acceptable because misclassification is cheap to fix and rare in practice.
- **Soft enum `recipe_type` carries UX semantics with no structural enforcement.** A buggy UI could let a plate be referenced as a component input. Trade-off accepted; the alternative — splitting tables — produces worse problems.

### Neutral

- "Did Coles roast it or did I roast it" becomes a `batches.source_type` query, not a structural distinction. This is the correct level of granularity: provenance is per-batch, not per-ingredient.
- A recipe with `yield_qty = 0` (e.g. a technique that doesn't produce a storable output) is allowed; cook events for such recipes do not create batches. PRD-108 invariant: `recipe_runs.yielded_batch_id` is set iff `yield_qty > 0`.

## References

- [Food spike](../ideas/food-app-spike.md) — original scoping discussion
- [Food pillar](../README.md)
- PRD-106 — ingredient model (the singular `ingredients` table)
- PRD-107 — recipe model (`yield_ingredient_id`, cycle detection invariant)
- PRD-108 — batch model (`source_type`, FIFO consumption, batch ↔ recipe_run linkage)
