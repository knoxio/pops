-- Food pillar baseline for the conversions slice (Theme-13 Wave-5 cascade
-- per PR #3191's food handler audit). Mirrors the shared `pops.db` shape
-- from `0066_prd_123_conversions.sql` (PRD-123): `unit_conversions`
-- (universal `from_unit → to_unit (g|ml|count) × ratio`) and
-- `ingredient_weights` (per-ingredient "1 of this unit weighs X grams").
--
-- Cross-pillar reference: `ingredient_weights.ingredient_id` and
-- `ingredient_weights.variant_id` are soft pointers into
-- `pops.db.ingredients` / `pops.db.ingredient_variants`. We do NOT enforce
-- the FKs at the SQLite level — the ingredients cluster stays on the
-- shared `pops.db` for now and SQLite FKs cannot cross ATTACH-ed databases.
-- Once the ingredients cluster migrates into food-db a follow-up baseline
-- can promote the soft pointers back to hard FKs. Mirrors the same
-- soft-pointer pattern `0030_media_scores_baseline.sql` uses for
-- `media_scores.dimension_id → comparison_dimensions`.
--
-- Existing rows are backfilled into food.db via the ATTACH bridge in
-- `apps/pops-api/src/db/backfill-food-from-shared.ts`.

CREATE TABLE `unit_conversions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_unit` text NOT NULL,
	`to_unit` text NOT NULL,
	`ratio` real NOT NULL,
	`notes` text,
	`is_seeded` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT "ck_unit_conversions_to_unit" CHECK("unit_conversions"."to_unit" IN ('g','ml','count')),
	CONSTRAINT "ck_unit_conversions_ratio_positive" CHECK("unit_conversions"."ratio" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_unit_conversions_from` ON `unit_conversions` (`from_unit`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_unit_conversions_from_to` ON `unit_conversions` (`from_unit`,`to_unit`);--> statement-breakpoint
CREATE TABLE `ingredient_weights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ingredient_id` integer NOT NULL,
	`variant_id` integer,
	`unit` text NOT NULL,
	`grams` real NOT NULL,
	`notes` text,
	`is_seeded` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT "ck_ingredient_weights_grams_positive" CHECK("ingredient_weights"."grams" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_ingredient_weights_ingredient` ON `ingredient_weights` (`ingredient_id`);--> statement-breakpoint
-- Drizzle's three-column UNIQUE treats NULL as distinct (SQLite default), so two
-- rows with the same (ingredient_id, NULL, unit) would both insert. Split into
-- two partial UNIQUE indexes to collapse the null-variant shape correctly —
-- mirrors `0066_prd_123_conversions.sql` in the shared pops.db journal.
CREATE UNIQUE INDEX `uq_ingredient_weights_with_variant`
	ON `ingredient_weights` (`ingredient_id`, `variant_id`, `unit`)
	WHERE `variant_id` IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ingredient_weights_any_variant`
	ON `ingredient_weights` (`ingredient_id`, `unit`)
	WHERE `variant_id` IS NULL;
