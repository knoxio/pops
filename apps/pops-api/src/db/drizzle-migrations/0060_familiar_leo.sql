CREATE TABLE `batch_consumptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_run_id` integer NOT NULL,
	`batch_id` integer NOT NULL,
	`qty_consumed` real NOT NULL,
	`unit` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`recipe_run_id`) REFERENCES `recipe_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_batch_consumptions_qty" CHECK("batch_consumptions"."qty_consumed" > 0),
	CONSTRAINT "ck_batch_consumptions_unit" CHECK("batch_consumptions"."unit" IN ('g','ml','count'))
);
--> statement-breakpoint
CREATE INDEX `idx_batch_consumptions_run` ON `batch_consumptions` (`recipe_run_id`);--> statement-breakpoint
CREATE INDEX `idx_batch_consumptions_batch` ON `batch_consumptions` (`batch_id`);--> statement-breakpoint
CREATE TABLE `batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`variant_id` integer NOT NULL,
	`prep_state_id` integer,
	`qty_remaining` real NOT NULL,
	`unit` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` integer,
	`location` text NOT NULL,
	`produced_at` text NOT NULL,
	`expires_at` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `ingredient_variants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prep_state_id`) REFERENCES `prep_states`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_batches_qty_remaining" CHECK("batches"."qty_remaining" >= 0),
	CONSTRAINT "ck_batches_unit" CHECK("batches"."unit" IN ('g','ml','count')),
	CONSTRAINT "ck_batches_source_type" CHECK("batches"."source_type" IN ('purchase','recipe_run','gift','other')),
	CONSTRAINT "ck_batches_location" CHECK("batches"."location" IN ('pantry','fridge','freezer','other'))
);
--> statement-breakpoint
CREATE INDEX `idx_batches_variant_prep` ON `batches` (`variant_id`,`prep_state_id`);--> statement-breakpoint
CREATE INDEX `idx_batches_location_expiry` ON `batches` (`location`,`expires_at`);--> statement-breakpoint
-- Partial index for the hot fridge-view query: only non-depleted batches.
-- Drizzle-kit can't express the WHERE clause in its schema DSL.
CREATE INDEX `idx_batches_remaining` ON `batches` (`variant_id`,`prep_state_id`) WHERE `qty_remaining` > 0;--> statement-breakpoint
CREATE TABLE `recipe_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_version_id` integer NOT NULL,
	`started_at` text,
	`completed_at` text,
	`scale_factor` real DEFAULT 1 NOT NULL,
	`yielded_batch_id` integer,
	`rating` integer,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`recipe_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`yielded_batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_recipe_runs_scale" CHECK("recipe_runs"."scale_factor" > 0),
	CONSTRAINT "ck_recipe_runs_rating" CHECK("recipe_runs"."rating" IS NULL OR ("recipe_runs"."rating" BETWEEN 1 AND 5))
);
--> statement-breakpoint
CREATE INDEX `idx_recipe_runs_version` ON `recipe_runs` (`recipe_version_id`);--> statement-breakpoint
-- Partial index for "completed runs" — cook history / fridge-population queries
-- skip the in-flight rows.
CREATE INDEX `idx_recipe_runs_complete` ON `recipe_runs` (`completed_at`) WHERE `completed_at` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `ingredient_variants` ADD `default_shelf_life_days_fridge` integer;--> statement-breakpoint
ALTER TABLE `ingredient_variants` ADD `default_shelf_life_days_freezer` integer;
