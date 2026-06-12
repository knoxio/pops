-- Cerebrum pillar baseline for the plexus slice (PRD-180 US-01).
--
-- Mirrors the plexus_adapters + plexus_filters schema as it stands in
-- the shared pops.db (drizzle-migrations/0041_plexus_adapters.sql).
-- Column definitions and indexes are copied verbatim so a fresh
-- cerebrum.db matches the shared shape byte-for-byte; the boot-time
-- backfill ATTACHes pops.db and copies rows across without
-- column-rename gymnastics.
--
-- Adapter HTTP clients (Notion / Linear / etc.) are stateless and stay
-- on pops-api — only the registry tables move here. The encrypted
-- `config` blob keeps its envelope-encryption envelope intact (PRD-171
-- pattern): cerebrum-db is a pure storage seam and never decrypts.

CREATE TABLE `plexus_adapters` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'registered' NOT NULL,
	`config` text,
	`last_health` text,
	`last_error` text,
	`ingested_count` integer DEFAULT 0 NOT NULL,
	`emitted_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_plexus_adapters_name` ON `plexus_adapters` (`name`);--> statement-breakpoint
CREATE INDEX `idx_plexus_adapters_status` ON `plexus_adapters` (`status`);--> statement-breakpoint
CREATE TABLE `plexus_filters` (
	`id` text PRIMARY KEY NOT NULL,
	`adapter_id` text NOT NULL,
	`filter_type` text NOT NULL,
	`field` text NOT NULL,
	`pattern` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`adapter_id`) REFERENCES `plexus_adapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_plexus_filters_adapter_id` ON `plexus_filters` (`adapter_id`);
