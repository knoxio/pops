# Seed Data — Deferred Extensions

Forward-looking additions to the shipped food dev seeder (`prds/seed-data`). None are built; the v1 seed is deliberately food-scoped and hand-curated.

## Cross-domain / cross-pillar seed coordination

The original spec called for a top-level `db:seed` that, when the food schema was detected, called into food's seeder — a monolith-era idea that died with the pillar collapse. There is no shared DB and no central seeder: each pillar owns its own SQLite file and its own (optional) dev seeder. If a fleet-wide "seed everything" dev affordance is ever wanted, build it as an orchestration layer over each pillar's public seed surface (HTTP or a per-pillar CLI), not as one process reaching into multiple DBs. Detection-by-table-presence is no longer meaningful in a federated layout.

## Lists fixtures via the lists pillar's own surface

Phase 1 originally seeded two lists (one shopping, one generic) plus list items. That was dropped during the food pillar collapse — food no longer reaches into the lists pillar's DB. Re-introduce lists fixtures through the **lists pillar's** own seeder/public API so the lists pillar's surfaces have content to render. Keep it owned by lists, driven (if needed) by the cross-pillar coordinator above, not by food's seeder.

## Bulk import of common-ingredient datasets

The hand-curated ~22 ingredients are enough for v1. A real ingredient library wants thousands of rows (USDA FoodData Central, Open Food Facts). Build an importer that maps an external dataset onto the ingredient/variant/alias/weight schema, with provenance tagging to distinguish imported rows from user-authored ones, and a way to refresh against upstream without clobbering local edits. This is an import pipeline, not a dev seed — it should not be destructive and should not run on `db:seed:food`.

## Broader user-history fixtures

The seed plants the minimum to wire `recipe_runs` ↔ `batches` ↔ `batch_consumptions` (one run, one yielded batch). A richer demo wants weeks of cook history, ratings, and consumption trails so analytics/insight surfaces have signal. Expand the batch/run fixtures into a multi-week history once there's a surface that consumes it.
