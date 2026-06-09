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
CREATE INDEX `idx_plan_entries_date` ON `plan_entries` (`date`);--> statement-breakpoint
CREATE INDEX `idx_plan_entries_date_slot` ON `plan_entries` (`date`,`slot`);--> statement-breakpoint
CREATE INDEX `idx_plan_entries_recipe` ON `plan_entries` (`recipe_id`);--> statement-breakpoint
-- Partial index — covers "uncooked" plan entries only. drizzle-kit can't
-- express the WHERE clause in its schema DSL; this is the hand-edited
-- enforcement for PRD-111's "unscheduled" lookup path.
CREATE INDEX `idx_plan_entries_unscheduled` ON `plan_entries` (`recipe_id`) WHERE `recipe_run_id` IS NULL;--> statement-breakpoint
CREATE TABLE `plan_slots` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`display_order` integer DEFAULT 100 NOT NULL,
	`is_default` integer DEFAULT 0 NOT NULL
);
