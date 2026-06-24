# ADR-024: Substitutions Are Single-Hop Only

## Status

Accepted — 2026-06-08

## Context

`substitution-model` (Substitution Model) introduces a directed graph of substitution edges: "A can stand in for B at ratio R, in these contexts". The graph is consumed at three different surfaces in the food theme:

- **Cook time** — `cook-time-substitutions`'s `BatchOverridePicker` surfaces substitutes when a recipe-line's same-variant batches are short or missing.
- **Plan time** — `cook-solver`'s solver answers "what can I cook tonight" by walking each recipe's lines against the fridge + the substitution graph.
- **Authoring** — `data-page`'s CRUD page lets the user curate substitution edges; `substitution-graph-explorer`'s graph explorer visualises them.

A natural question arises: should substitution resolution traverse the graph transitively? If `butter → olive-oil → coconut-oil` edges exist, can a recipe needing butter be satisfied by coconut oil via the two-hop path?

## Options Considered

| Option                          | Pros                                                                                         | Cons                                                                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Single-hop (chosen)**         | Bounded query cost; predictable UX; user-visible mappings stay close to the user's intent    | Forces the user to curate direct edges for every relevant substitution; no "free" extensibility                                                                                                |
| **Two-hop with attenuation**    | More flexible without runaway chains; cumulative ratio cost discourages over-deep traversals | Two-hop ratios compound (`0.75 × 1.33 = 0.9975` ≈ identity); UI must show the chain so the user understands which sub-of-a-sub is being suggested; quality of the second hop is often nonsense |
| **Unbounded transitive search** | Maximal flexibility from a small curated graph                                               | Chains explode into culinary nonsense ("butter → olive oil → sesame oil → tahini"); ratio compounding loses meaning; query cost grows exponentially with chain length                          |
| **Configurable hop depth**      | Per-query control                                                                            | Inflates the UI; user has to think about depth at cook time, which is the wrong time                                                                                                           |

## Decision

Substitution resolution is **single-hop only**. The graph is consulted at depth 1 from the recipe-line's variant; multi-hop chains are not auto-resolved. If the user wants `coconut-oil` to be acceptable for a `butter` line, they must declare the direct edge `butter → coconut-oil` themselves.

This rule is enforced by the substitution-resolve service (canonically `cook-solver`'s `substitutions-resolve.ts`):

- The service queries `substitutions WHERE from_* = <line's variant or ingredient>` and returns only matching `to_*` entities. It does NOT recurse into `substitutions WHERE from_* = <resolved to_*>`.
- `cook-time-substitutions`'s `BatchOverridePicker` and `cook-solver`'s solver both consume this service; neither implements its own walk.
- `substitution-graph-explorer`'s graph explorer renders edges as drawn (no virtual transitive edges).

## Consequences

**Positive:**

- Query cost is O(N×M×K) for the solver where N = recipes, M = lines/recipe, K = direct subs/line. Bounded and SQL-indexable.
- The substitution graph the user curates IS exactly the substitution graph the system uses — no hidden inferences.
- UX is predictable: "I have olive oil; I never declared olive oil → coconut oil, so coconut oil won't be offered as a sub" matches user mental model.
- Cycle handling is trivial — the rule prevents self-substitution chains at consumption time even if a user accidentally curates one.

**Negative:**

- The user must declare more edges. For a fully-connected sub graph among 5 alternative oils, that's `5 × 4 = 20` directed edges instead of 1 + the implicit transitive closure.
- Edge curation is a recurring task as the recipe library grows. Mitigation: `data-page`'s CRUD UI + `substitution-graph-explorer`'s graph explorer surface the existing edges; the autocomplete picker prevents drift.

**Revisitable:**

The single-hop rule is hardcoded in service-layer code rather than in the schema. Switching to two-hop later is a service-layer change, not a migration. If usage patterns show users routinely curating chained pairs that single-hop misses, this ADR can be superseded.

## Cross-cutting consequences

- **`substitution-model`** (schema): no transitive-closure column; just direct edges.
- **`data-page`** (CRUD): users add direct edges; no "infer transitive closure" affordance.
- **`substitution-graph-explorer`** (graph explorer): renders edges as direct; doesn't synthesise virtual edges.
- **`cook-time-substitutions`** (cook-time): picker shows depth-1 subs only.
- **`cook-solver`** (solver): `canICook` walks depth-1 only.
