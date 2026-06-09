CREATE TABLE `substitutions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_ingredient_id` integer,
	`from_variant_id` integer,
	`to_ingredient_id` integer,
	`to_variant_id` integer,
	`ratio` real DEFAULT 1 NOT NULL,
	`context_tags` text DEFAULT '[]' NOT NULL,
	`scope` text DEFAULT 'global' NOT NULL,
	`recipe_id` integer,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`from_ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_variant_id`) REFERENCES `ingredient_variants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_variant_id`) REFERENCES `ingredient_variants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_subs_xor_from" CHECK(("substitutions"."from_ingredient_id" IS NOT NULL) <> ("substitutions"."from_variant_id" IS NOT NULL)),
	CONSTRAINT "ck_subs_xor_to" CHECK(("substitutions"."to_ingredient_id" IS NOT NULL) <> ("substitutions"."to_variant_id" IS NOT NULL)),
	CONSTRAINT "ck_subs_scope_recipe" CHECK(("substitutions"."scope" = 'recipe' AND "substitutions"."recipe_id" IS NOT NULL) OR ("substitutions"."scope" = 'global' AND "substitutions"."recipe_id" IS NULL)),
	CONSTRAINT "ck_subs_scope" CHECK("substitutions"."scope" IN ('global','recipe')),
	CONSTRAINT "ck_subs_ratio_positive" CHECK("substitutions"."ratio" > 0)
);
--> statement-breakpoint
-- Partial indexes from PRD-109 — drop NULL rows so the from-side lookups stay
-- compact (exactly half the table is NULL on each side per the XOR CHECK).
CREATE INDEX `idx_subs_from_ing` ON `substitutions` (`from_ingredient_id`) WHERE `from_ingredient_id` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_subs_from_var` ON `substitutions` (`from_variant_id`) WHERE `from_variant_id` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_subs_scope_recipe` ON `substitutions` (`scope`,`recipe_id`) WHERE `scope` = 'recipe';--> statement-breakpoint
-- PRD-109 partial UNIQUE — "no duplicate (from, to, scope[, recipe_id])".
-- SQLite treats NULL as distinct inside compound UNIQUE; from/to each carry
-- one NULL by the XOR CHECK, so the four-column tuple in the PRD would let
-- duplicates slip in. Split into four indexes per scope, one per
-- ingredient/variant combination on each side.
CREATE UNIQUE INDEX `uq_subs_global_ing_ing` ON `substitutions` (`from_ingredient_id`,`to_ingredient_id`) WHERE `scope` = 'global' AND `from_variant_id` IS NULL AND `to_variant_id` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_subs_global_ing_var` ON `substitutions` (`from_ingredient_id`,`to_variant_id`) WHERE `scope` = 'global' AND `from_variant_id` IS NULL AND `to_ingredient_id` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_subs_global_var_ing` ON `substitutions` (`from_variant_id`,`to_ingredient_id`) WHERE `scope` = 'global' AND `from_ingredient_id` IS NULL AND `to_variant_id` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_subs_global_var_var` ON `substitutions` (`from_variant_id`,`to_variant_id`) WHERE `scope` = 'global' AND `from_ingredient_id` IS NULL AND `to_ingredient_id` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_subs_recipe_ing_ing` ON `substitutions` (`from_ingredient_id`,`to_ingredient_id`,`recipe_id`) WHERE `scope` = 'recipe' AND `from_variant_id` IS NULL AND `to_variant_id` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_subs_recipe_ing_var` ON `substitutions` (`from_ingredient_id`,`to_variant_id`,`recipe_id`) WHERE `scope` = 'recipe' AND `from_variant_id` IS NULL AND `to_ingredient_id` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_subs_recipe_var_ing` ON `substitutions` (`from_variant_id`,`to_ingredient_id`,`recipe_id`) WHERE `scope` = 'recipe' AND `from_ingredient_id` IS NULL AND `to_variant_id` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_subs_recipe_var_var` ON `substitutions` (`from_variant_id`,`to_variant_id`,`recipe_id`) WHERE `scope` = 'recipe' AND `from_ingredient_id` IS NULL AND `to_ingredient_id` IS NULL;