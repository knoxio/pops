ALTER TABLE `ingest_sources` ADD `error_code` text;--> statement-breakpoint
ALTER TABLE `ingest_sources` ADD `error_message` text;--> statement-breakpoint
ALTER TABLE `ingest_sources` ADD `attempts` integer DEFAULT 0 NOT NULL;