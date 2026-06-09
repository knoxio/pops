CREATE TABLE `ingredient_weights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ingredient_id` integer NOT NULL,
	`variant_id` integer,
	`unit` text NOT NULL,
	`grams` real NOT NULL,
	`notes` text,
	`is_seeded` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `ingredient_variants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_ingredient_weights_grams_positive" CHECK("ingredient_weights"."grams" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_ingredient_weights_ingredient` ON `ingredient_weights` (`ingredient_id`);--> statement-breakpoint
-- Drizzle's three-column UNIQUE treats NULL as distinct (SQLite default), so two
-- rows with the same (ingredient_id, NULL, unit) would both insert. Split into
-- two partial UNIQUE indexes to collapse the null-variant shape correctly —
-- same pattern PRD-106's alias unique and PRD-109's substitutions unique use.
DROP INDEX IF EXISTS `uq_ingredient_weights_ing_var_unit`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ingredient_weights_with_variant`
	ON `ingredient_weights` (`ingredient_id`, `variant_id`, `unit`)
	WHERE `variant_id` IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ingredient_weights_any_variant`
	ON `ingredient_weights` (`ingredient_id`, `unit`)
	WHERE `variant_id` IS NULL;--> statement-breakpoint
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
CREATE UNIQUE INDEX `uq_unit_conversions_from_to` ON `unit_conversions` (`from_unit`,`to_unit`);
