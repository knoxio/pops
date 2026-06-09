CREATE TABLE `recipe_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_version_id` integer NOT NULL,
	`position` integer NOT NULL,
	`ingredient_id` integer NOT NULL,
	`variant_id` integer,
	`prep_state_id` integer,
	`is_recipe_ref` integer DEFAULT 0 NOT NULL,
	`recipe_ref_id` integer,
	`original_text` text NOT NULL,
	`original_qty` real NOT NULL,
	`original_unit` text NOT NULL,
	`qty_g` real,
	`qty_ml` real,
	`qty_count` real,
	`canonical_unit` text NOT NULL,
	`optional` integer DEFAULT 0 NOT NULL,
	`notes` text,
	FOREIGN KEY (`recipe_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `ingredient_variants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prep_state_id`) REFERENCES `prep_states`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_ref_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_recipe_lines_canonical_unit" CHECK("recipe_lines"."canonical_unit" IN ('g','ml','count')),
	-- recipe-ref consistency: is_recipe_ref=0 ↔ recipe_ref_id IS NULL.
	CONSTRAINT "ck_recipe_lines_recipe_ref" CHECK(
		("recipe_lines"."is_recipe_ref" = 0 AND "recipe_lines"."recipe_ref_id" IS NULL)
		OR ("recipe_lines"."is_recipe_ref" = 1 AND "recipe_lines"."recipe_ref_id" IS NOT NULL)
	)
);
--> statement-breakpoint
CREATE INDEX `idx_recipe_lines_ingredient` ON `recipe_lines` (`ingredient_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_recipe_lines_version_position` ON `recipe_lines` (`recipe_version_id`,`position`);--> statement-breakpoint
-- Partial index — the cycle detector and recipe-graph queries only care about
-- lines that ARE recipe refs. Skipping the bulk of non-ref rows keeps the
-- index small.
CREATE INDEX `idx_recipe_lines_recipe_ref` ON `recipe_lines` (`recipe_ref_id`) WHERE `recipe_ref_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `recipe_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_version_id` integer NOT NULL,
	`position` integer NOT NULL,
	`body_md` text NOT NULL,
	`body_resolved_json` text NOT NULL,
	`duration_minutes` integer,
	`temperature_value` real,
	`temperature_unit` text,
	FOREIGN KEY (`recipe_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_recipe_steps_temperature_unit" CHECK("recipe_steps"."temperature_unit" IS NULL OR "recipe_steps"."temperature_unit" IN ('c','f','gas'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_recipe_steps_version_position` ON `recipe_steps` (`recipe_version_id`,`position`);--> statement-breakpoint
CREATE TABLE `recipe_version_proposed_slugs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_version_id` integer NOT NULL,
	`slug` text NOT NULL,
	`suggested_kind` text,
	`from_loc_json` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`recipe_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_proposed_slugs_kind" CHECK("recipe_version_proposed_slugs"."suggested_kind" IS NULL OR "recipe_version_proposed_slugs"."suggested_kind" IN ('ingredient','recipe','prep_state'))
);
--> statement-breakpoint
CREATE INDEX `idx_proposed_slugs_version` ON `recipe_version_proposed_slugs` (`recipe_version_id`);--> statement-breakpoint
CREATE INDEX `idx_proposed_slugs_slug` ON `recipe_version_proposed_slugs` (`slug`);
