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
CREATE INDEX `idx_recipes_type` ON `recipes` (`recipe_type`);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_slug_unique` ON `recipes` (`slug`);
--> statement-breakpoint
CREATE TABLE `recipe_tags` (
	`recipe_id` integer NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`recipe_id`, `tag`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_recipe_tags_tag` ON `recipe_tags` (`tag` COLLATE NOCASE);
--> statement-breakpoint
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
CREATE INDEX `idx_recipe_versions_compile` ON `recipe_versions` (`compile_status`);
--> statement-breakpoint
CREATE INDEX `idx_recipe_versions_recipe` ON `recipe_versions` (`recipe_id`);
--> statement-breakpoint
CREATE INDEX `idx_recipe_versions_status` ON `recipe_versions` (`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_recipe_versions_one_current` ON `recipe_versions` (`recipe_id`) WHERE `status` = 'current';
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_recipe_versions_recipe_no` ON `recipe_versions` (`recipe_id`,`version_no`);
--> statement-breakpoint
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
CREATE INDEX `idx_recipe_lines_ingredient` ON `recipe_lines` (`ingredient_id`);
--> statement-breakpoint
CREATE INDEX `idx_recipe_lines_recipe_ref` ON `recipe_lines` (`recipe_ref_id`) WHERE `recipe_ref_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_recipe_lines_version_position` ON `recipe_lines` (`recipe_version_id`,`position`);
--> statement-breakpoint
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
CREATE UNIQUE INDEX `uq_recipe_steps_version_position` ON `recipe_steps` (`recipe_version_id`,`position`);
--> statement-breakpoint
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
CREATE INDEX `idx_proposed_slugs_slug` ON `recipe_version_proposed_slugs` (`slug`);
--> statement-breakpoint
CREATE INDEX `idx_proposed_slugs_version` ON `recipe_version_proposed_slugs` (`recipe_version_id`);
--> statement-breakpoint
CREATE TABLE `recipe_version_rejections` (
	`version_id` integer PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`rejected_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	-- PRD-136 — reason is constrained to a 5-value enum. Drizzle-kit doesn't
	-- emit CHECKs for `enum` text columns; hand-edited.
	CONSTRAINT "ck_recipe_version_rejections_reason" CHECK("recipe_version_rejections"."reason" IN ('wrong-recipe','low-quality-extraction','duplicate','not-a-recipe','other'))
);
--> statement-breakpoint
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
CREATE INDEX `idx_recipe_runs_complete` ON `recipe_runs` (`completed_at`) WHERE `completed_at` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_recipe_runs_version` ON `recipe_runs` (`recipe_version_id`);
--> statement-breakpoint
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
	`created_at` text DEFAULT (datetime('now')) NOT NULL, `deleted_at` text,
	FOREIGN KEY (`variant_id`) REFERENCES `ingredient_variants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prep_state_id`) REFERENCES `prep_states`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_batches_qty_remaining" CHECK("batches"."qty_remaining" >= 0),
	CONSTRAINT "ck_batches_unit" CHECK("batches"."unit" IN ('g','ml','count')),
	CONSTRAINT "ck_batches_source_type" CHECK("batches"."source_type" IN ('purchase','recipe_run','gift','other')),
	CONSTRAINT "ck_batches_location" CHECK("batches"."location" IN ('pantry','fridge','freezer','other'))
);
--> statement-breakpoint
CREATE INDEX `idx_batches_location_expiry` ON `batches` (`location`,`expires_at`);
--> statement-breakpoint
CREATE INDEX `idx_batches_remaining` ON `batches` (`variant_id`,`prep_state_id`) WHERE `qty_remaining` > 0;
--> statement-breakpoint
CREATE INDEX `idx_batches_variant_prep` ON `batches` (`variant_id`,`prep_state_id`);
--> statement-breakpoint
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
CREATE INDEX `idx_batch_consumptions_batch` ON `batch_consumptions` (`batch_id`);
--> statement-breakpoint
CREATE INDEX `idx_batch_consumptions_run` ON `batch_consumptions` (`recipe_run_id`);
--> statement-breakpoint
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
CREATE INDEX `idx_subs_from_ing` ON `substitutions` (`from_ingredient_id`) WHERE `from_ingredient_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_subs_from_var` ON `substitutions` (`from_variant_id`) WHERE `from_variant_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_subs_scope_recipe` ON `substitutions` (`scope`,`recipe_id`) WHERE `scope` = 'recipe';
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_subs_global_ing_ing` ON `substitutions` (`from_ingredient_id`,`to_ingredient_id`) WHERE `scope` = 'global' AND `from_variant_id` IS NULL AND `to_variant_id` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_subs_global_ing_var` ON `substitutions` (`from_ingredient_id`,`to_variant_id`) WHERE `scope` = 'global' AND `from_variant_id` IS NULL AND `to_ingredient_id` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_subs_global_var_ing` ON `substitutions` (`from_variant_id`,`to_ingredient_id`) WHERE `scope` = 'global' AND `from_ingredient_id` IS NULL AND `to_variant_id` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_subs_global_var_var` ON `substitutions` (`from_variant_id`,`to_variant_id`) WHERE `scope` = 'global' AND `from_ingredient_id` IS NULL AND `to_ingredient_id` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_subs_recipe_ing_ing` ON `substitutions` (`from_ingredient_id`,`to_ingredient_id`,`recipe_id`) WHERE `scope` = 'recipe' AND `from_variant_id` IS NULL AND `to_variant_id` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_subs_recipe_ing_var` ON `substitutions` (`from_ingredient_id`,`to_variant_id`,`recipe_id`) WHERE `scope` = 'recipe' AND `from_variant_id` IS NULL AND `to_ingredient_id` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_subs_recipe_var_ing` ON `substitutions` (`from_variant_id`,`to_ingredient_id`,`recipe_id`) WHERE `scope` = 'recipe' AND `from_ingredient_id` IS NULL AND `to_variant_id` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_subs_recipe_var_var` ON `substitutions` (`from_variant_id`,`to_variant_id`,`recipe_id`) WHERE `scope` = 'recipe' AND `from_ingredient_id` IS NULL AND `to_ingredient_id` IS NULL;
--> statement-breakpoint
CREATE TABLE `plan_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`slot` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`recipe_id` integer NOT NULL,
	`recipe_version_id` integer,
	`planned_servings` integer DEFAULT 1 NOT NULL,
	`recipe_run_id` integer,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`slot`) REFERENCES `plan_slots`(`slug`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_run_id`) REFERENCES `recipe_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_plan_entries_planned_servings" CHECK("plan_entries"."planned_servings" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_plan_entries_date` ON `plan_entries` (`date`);
--> statement-breakpoint
CREATE INDEX `idx_plan_entries_date_slot` ON `plan_entries` (`date`,`slot`);
--> statement-breakpoint
CREATE INDEX `idx_plan_entries_recipe` ON `plan_entries` (`recipe_id`);
--> statement-breakpoint
CREATE INDEX `idx_plan_entries_unscheduled` ON `plan_entries` (`recipe_id`) WHERE `recipe_run_id` IS NULL;
--> statement-breakpoint
CREATE TABLE `plan_slots` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`display_order` integer DEFAULT 100 NOT NULL,
	`is_default` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ingest_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`url` text,
	`caption` text,
	`transcript_path` text,
	`keyframes_dir` text,
	`video_path` text,
	`extracted_json` text,
	`extractor_version` text NOT NULL,
	`draft_recipe_id` integer,
	`ingested_at` text DEFAULT (datetime('now')) NOT NULL,
	`archived_at` text, `error_code` text, `error_message` text, `attempts` integer DEFAULT 0 NOT NULL, `reviewed_at` text,
	FOREIGN KEY (`draft_recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_ingest_sources_kind" CHECK("ingest_sources"."kind" IN ('url-web','url-instagram','text','screenshot'))
);
--> statement-breakpoint
CREATE INDEX `idx_ingest_sources_ingested` ON `ingest_sources` (`ingested_at`);
--> statement-breakpoint
CREATE INDEX `idx_ingest_sources_kind` ON `ingest_sources` (`kind`);
--> statement-breakpoint
CREATE INDEX `idx_ingest_sources_recipe` ON `ingest_sources` (`draft_recipe_id`);
