# Epic 00: Schema & Foundations

> Theme: [Food](../README.md)

## Scope

Land all SQLite tables, indexes, constraints, invariants, and the recipe-DSL pipeline required by the food app. Each schema area or pipeline stage is its own PRD so they can be reviewed and merged independently; together they form the foundation every other epic builds on. Done when `mise db:init && mise db:seed:food` produces a coherent food database, all invariant and DSL tests pass, and `packages/db-types` exports the new types.

This epic is schema-and-data + the DSL parsing/resolving/compiling pipeline. No API procedures, no UI, no ingestion worker — those live in Epics 01, 02, and 03.

## PRDs

| #   | PRD                                                                             | Summary                                                                                                        | Status      |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------- |
| 106 | [Ingredient & Variant Model](../prds/ingredient-model/README.md)                | Canonical ingredients with hierarchy, variants, prep_states, aliases, `slug_registry` (global namespace)       | Done        |
| 107 | [Recipe & Version Schema](../prds/recipe-model/README.md)                       | `recipes`, `recipe_versions`, `recipe_tags`; status enum; hero image; slug registration; compile-state columns | Done        |
| 114 | [DSL Grammar & Parser](../prds/dsl-parser/README.md)                            | Formal grammar per [ADR-023](../architecture/adr-023-recipe-markdown-dsl.md); text → AST; typed parse errors   | Done        |
| 115 | [DSL Resolver](../prds/dsl-resolver/README.md)                                  | AST → ResolvedRecipeAst via `slug_registry`; variant scoping; proposed-slug tracking for unknown refs          | Done        |
| 116 | [Recipe Lines & Steps Materialisation](../prds/lines-materialisation/README.md) | `recipe_lines`, `recipe_steps`, `recipe_version_proposed_slugs` tables; `compileRecipeVersion()` function      | Done        |
| 117 | [Recipe Graph Cycle Detection](../prds/recipe-cycle-detection/README.md)        | DFS over the recipe ↔ yield ↔ recipe graph; invariant fires at compile; `RecipeCycleError`                     | Done        |
| 108 | [Batch & Cook Event Model](../prds/batch-model/README.md)                       | Batches with provenance and expiry, recipe_runs, batch_consumptions, FIFO consumption helpers                  | Done        |
| 109 | [Substitution Model](../prds/substitution-model/README.md)                      | Substitution graph (global + per-recipe), context tags, source-cardinality CHECKs                              | Done        |
| 110 | [Ingest Source & Media Layout](../prds/ingest-sources/README.md)                | `ingest_sources` table, `storage/food/ingest/` layout, 100-dir FIFO cap, Litestream exclusion config           | Partial     |
| 111 | [Plan Entry Model](../prds/plan-entry-model/README.md)                          | `plan_entries` table; slot enum; ad-hoc vs slotted entries; date range queries                                 | Partial     |
| —   | [Lists Schema](../../../lists/docs/prds/schema/README.md) (lists pillar)        | `lists`, `list_items` — owned by the lists pillar; food is the first consumer via the SDK                      | Done        |
| 113 | [Seed Data & Mise Tasks](../prds/seed-data/README.md)                           | `db:seed:food` task, fixture set covering invariants, `db-types` regen, baseline conversions                   | Not started |

### Build order

```
106 ──► 107 ──► 114 ──► 115 ──► 116 ──► 117
                                  \
                                   └──► 108 ──► 113
                                   └──► 109
                                   └──► 110
                                   └──► 111
                                   └──► 112
```

- **106** lands first (every other schema FKs into ingredients; `slug_registry` is its responsibility).
- **107** declares the recipe header tables AND the compile-state columns that `lines-materialisation` writes.
- **114** is pure parser — no DB. Can technically be built any time after 107's contract is set; placed in the chain here because it feeds 115.
- **115** needs 106 (registry lookup) and 107 (recipes existing). Pure-function shape, read-only DB.
- **116** introduces `recipe_lines` and `recipe_steps` and the compile function. Calls 114 + 115 + 117.
- **117** is invoked from 116's compile; lives separately because the algorithm and tests are independent.
- **108–112** are independent schemas that can each be built in parallel once 116 is in (any cook-event / planning code reads `recipe_lines`).
- **113** is last — seed data exercises the union.

The DSL pipeline (107 → 114 → 115 → 116 → 117) is linear. Everything else fans out from 116.

## Dependencies

- **Requires:** Phase 1 foundation — Drizzle, migration tooling, `packages/db-types`. All present.
- **Unlocks:** Epic 01 (Recipe & Ingredient Management UI), Epic 02 (Ingestion Pipeline), and through them everything downstream.

## Out of Scope

- tRPC procedures and HTTP API (Epic 01 / 02 PRDs)
- Any UI — recipe editor, DSL autocomplete, error annotation, renderer (Epic 01 PRDs)
- The ingestion worker container (Epic 02)
- Conversion table (cup→ml, "1 medium onion" etc.) — deferred to an Epic 01 PRD; v1 compile handles only trivial g/ml/count carry-over
- Cross-domain entity links (finance / inventory) — separate themes
- Promotion of proposed slugs to real `slug_registry` entries — Epic 03 (review queue)
