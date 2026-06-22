-- Food pillar — #3490: drop the local `ai_inference_log` table.
--
-- AI inference telemetry is now owned by the ai pillar. Food's worker Claude
-- callers report through `@pops/ai-telemetry` to the ai pillar's
-- `POST /ai-usage/record` (#3496), and the local `/ai/log-inference` write
-- route is removed in this same change. No food table carries a foreign key to
-- `ai_inference_log` (context ids are opaque `ingest_source:<id>` strings, not
-- a DB-level FK), so the table drops in place with no rebuild.
--
-- DEPLOY ORDER: the one-shot `scripts/backfill-ai-inference.ts` reads this
-- table to migrate history into the ai pillar. It MUST run BEFORE this
-- migration deploys — the backfill opens the food SQLite with a raw read (not
-- `openFoodDb`, which would apply this drop on open) so it can still see the
-- rows. Sequence: run the backfill, confirm it transferred, THEN roll the food
-- image that ships this migration. Rollback is a litestream restore of
-- `food.db` plus reverting the deletion PR.

DROP TABLE IF EXISTS `ai_inference_log`;
