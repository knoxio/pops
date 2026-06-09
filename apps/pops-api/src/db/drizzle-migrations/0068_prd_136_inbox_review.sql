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
ALTER TABLE `ingest_sources` ADD `reviewed_at` text;
