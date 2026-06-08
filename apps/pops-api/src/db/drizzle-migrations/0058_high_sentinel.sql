CREATE TABLE `ingredient_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ingredient_id` integer,
	`variant_id` integer,
	`alias` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `ingredient_variants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_aliases_xor_target" CHECK(("ingredient_aliases"."ingredient_id" IS NOT NULL) <> ("ingredient_aliases"."variant_id" IS NOT NULL)),
	CONSTRAINT "ck_aliases_source" CHECK("ingredient_aliases"."source" IN ('user','llm','ingest'))
);
--> statement-breakpoint
CREATE INDEX `idx_aliases_alias` ON `ingredient_aliases` (`alias` COLLATE NOCASE);--> statement-breakpoint
-- Partial uniques split the PRD's `UNIQUE (alias, ingredient_id, variant_id)` into two
-- index expressions, because SQLite treats NULL as distinct in compound UNIQUE
-- constraints. With the XOR CHECK above, exactly one of these applies per row.
CREATE UNIQUE INDEX `uq_aliases_alias_ingredient` ON `ingredient_aliases` (`alias`,`ingredient_id`) WHERE `variant_id` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_aliases_alias_variant` ON `ingredient_aliases` (`alias`,`variant_id`) WHERE `ingredient_id` IS NULL;--> statement-breakpoint
CREATE TABLE `ingredient_variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ingredient_id` integer NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`default_unit` text NOT NULL,
	`package_size_g` real,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_variants_default_unit" CHECK("ingredient_variants"."default_unit" IN ('g','ml','count'))
);
--> statement-breakpoint
CREATE INDEX `idx_variants_ingredient` ON `ingredient_variants` (`ingredient_id`);--> statement-breakpoint
CREATE INDEX `idx_variants_name` ON `ingredient_variants` (`name` COLLATE NOCASE);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_variants_ingredient_slug` ON `ingredient_variants` (`ingredient_id`,`slug`);--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_id` integer,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`default_unit` text NOT NULL,
	`density_g_per_ml` real,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_ingredients_default_unit" CHECK("ingredients"."default_unit" IN ('g','ml','count'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingredients_slug_unique` ON `ingredients` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_ingredients_parent` ON `ingredients` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_ingredients_name` ON `ingredients` (`name` COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `prep_states` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prep_states_name_unique` ON `prep_states` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `prep_states_slug_unique` ON `prep_states` (`slug`);--> statement-breakpoint
CREATE TABLE `slug_registry` (
	`slug` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`target_id` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT "ck_slug_registry_kind" CHECK("slug_registry"."kind" IN ('ingredient','recipe','prep_state'))
);
--> statement-breakpoint
CREATE INDEX `idx_slug_registry_kind_target` ON `slug_registry` (`kind`,`target_id`);
