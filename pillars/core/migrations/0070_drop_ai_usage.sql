-- Core pillar — gap #3489: drop the finance-categorizer `ai_usage` table.
--
-- `ai_usage` is finance-categorizer per-description usage state, not AI-ops
-- telemetry (that slice already moved to the `ai` pillar). It re-homes to the
-- finance pillar, which now owns the `ai_usage` table and serves the
-- `/ai-usage/cache*` maintenance surface. The historical 0061_ai_usage CREATE
-- stays in the journal for replay fidelity; this migration drops the table in
-- place. No core table carries a foreign key to `ai_usage`, so it drops with
-- no rebuild.
--
-- DEPLOY ORDER: this migration ships in the core image that removes the
-- categorizer-cache surface and MUST roll out only AFTER the one-shot
-- `migrate-ai-usage` data migration has copied core's `ai_usage` rows into
-- finance (same staged-deploy caution as the entities migration, 0069). The
-- only rollback is a litestream restore of `core.db` plus reverting this PR.

DROP TABLE IF EXISTS `ai_usage`;
