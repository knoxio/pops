# Epic 00: Schema & Foundations

> Theme: [Food](../README.md)

## Scope

Land all SQLite tables, indexes, constraints, and invariants required by the food app. Each schema area is its own PRD so they can be reviewed and merged independently; together they form the foundation every other epic builds on. Done when `mise db:init && mise db:seed:food` produces a coherent food database, all invariant tests pass, and `packages/db-types` exports the new types.

This epic is schema-and-data only. No API procedures, no UI, no ingestion worker — those live in Epics 01, 02, and 03.

## PRDs

| #   | PRD                                                                  | Summary                                                                                              | Status      |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------- |
| 106 | [Ingredient & Variant Model](../prds/106-ingredient-model/README.md) | Canonical ingredients with hierarchy, variants, prep_states, aliases, cycle/CHECK constraints        | In progress |
| 107 | [Recipe & Version Model](../prds/107-recipe-model/README.md)         | Recipes, recipe_versions, recipe_lines, recipe_tags; current_version_id semantics; cycle detection   | Not started |
| 108 | [Batch & Cook Event Model](../prds/108-batch-model/README.md)        | Batches with provenance and expiry, recipe_runs, batch_consumptions, FIFO consumption helpers        | Not started |
| 109 | [Substitution Model](../prds/109-substitution-model/README.md)       | Substitution graph (global + per-recipe), context tags, source-cardinality CHECKs                    | Not started |
| 110 | [Ingest Source & Media Layout](../prds/110-ingest-sources/README.md) | `ingest_sources` table, `storage/food/ingest/` layout, 100-dir FIFO cap, Litestream exclusion config | Not started |
| 111 | [Plan Entry Model](../prds/111-plan-entry-model/README.md)           | `plan_entries` table; slot enum; ad-hoc vs slotted entries; date range queries                       | Not started |
| 112 | [Lists Schema (app-lists)](../prds/112-lists-schema/README.md)       | `lists`, `list_items` in new `packages/app-lists`; food as first consumer                            | Not started |
| 113 | [Seed Data & Mise Tasks](../prds/113-seed-data/README.md)            | `db:seed:food` task, fixture set covering invariants, `db-types` regen, baseline conversions         | Not started |

### Build order

```
106 ──► 107 ──► 108 ──► 113
   \      \       \
    └──► 109       └──► 111
    └──► 110
    └──► 112
```

106 must land first (everything FKs to ingredients). 107 follows (most schemas reference recipes / versions). 108 depends on both. 109, 110, 111, 112 can each be built in parallel once 106 is in. 113 (seed) is last and exercises the union of everything.

## Dependencies

- **Requires:** Phase 1 foundation — Drizzle, migration tooling, `packages/db-types`. All present.
- **Unlocks:** Epic 01 (Recipe & Ingredient Management UI), Epic 02 (Ingestion Pipeline), and through them everything downstream.

## Out of Scope

- tRPC procedures and HTTP API (Epic 01 / 02 PRDs)
- Any UI (Epic 01 / 03 PRDs)
- The ingestion worker container (Epic 02)
- Conversion table seeding for cup→ml, "1 medium onion" etc. — deferred to an Epic 01 PRD once we know how the recipe-line editor consumes it
- Cross-domain entity links (finance / inventory) — separate themes
