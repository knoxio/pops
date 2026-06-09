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
	`archived_at` text,
	FOREIGN KEY (`draft_recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_ingest_sources_kind" CHECK("ingest_sources"."kind" IN ('url-web','url-instagram','text','screenshot'))
);
--> statement-breakpoint
CREATE INDEX `idx_ingest_sources_kind` ON `ingest_sources` (`kind`);--> statement-breakpoint
CREATE INDEX `idx_ingest_sources_recipe` ON `ingest_sources` (`draft_recipe_id`);--> statement-breakpoint
CREATE INDEX `idx_ingest_sources_ingested` ON `ingest_sources` (`ingested_at`);