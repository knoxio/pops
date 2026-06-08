CREATE TABLE `recipe_tags` (
	`recipe_id` integer NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`recipe_id`, `tag`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_recipe_tags_tag` ON `recipe_tags` (`tag` COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `recipe_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`version_no` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`body_dsl` text NOT NULL,
	`yield_ingredient_id` integer,
	`yield_variant_id` integer,
	`yield_prep_state_id` integer,
	`yield_qty` real,
	`yield_unit` text,
	`servings` integer,
	`prep_minutes` integer,
	`cook_minutes` integer,
	`source_id` integer,
	`compile_status` text DEFAULT 'uncompiled' NOT NULL,
	`compile_error` text,
	`compiled_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`yield_ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`yield_variant_id`) REFERENCES `ingredient_variants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`yield_prep_state_id`) REFERENCES `prep_states`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_recipe_versions_status" CHECK("recipe_versions"."status" IN ('draft','current','archived')),
	CONSTRAINT "ck_recipe_versions_compile_status" CHECK("recipe_versions"."compile_status" IN ('uncompiled','compiled','failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_recipe_versions_recipe` ON `recipe_versions` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `idx_recipe_versions_status` ON `recipe_versions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_recipe_versions_compile` ON `recipe_versions` (`compile_status`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_recipe_versions_recipe_no` ON `recipe_versions` (`recipe_id`,`version_no`);--> statement-breakpoint
-- Partial unique — at most one current version per recipe. Drizzle-kit can't
-- express the WHERE clause in its schema DSL; this is the hand-edited
-- enforcement for PRD-107's "exactly one current" invariant.
CREATE UNIQUE INDEX `uq_recipe_versions_one_current` ON `recipe_versions` (`recipe_id`) WHERE `status` = 'current';--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`recipe_type` text DEFAULT 'plate' NOT NULL,
	`current_version_id` integer,
	`hero_image_path` text,
	`archived_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`current_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_recipes_type" CHECK("recipes"."recipe_type" IN ('plate','component','technique','sauce','dressing','drink','condiment'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_slug_unique` ON `recipes` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_recipes_type` ON `recipes` (`recipe_type`);
