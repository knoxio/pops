ALTER TABLE `pillar_registry` ADD COLUMN `origin` text DEFAULT 'internal' NOT NULL;--> statement-breakpoint
ALTER TABLE `pillar_registry` ADD COLUMN `api_key_hash` text;--> statement-breakpoint
ALTER TABLE `pillar_registry` ADD COLUMN `evicted_at` text;--> statement-breakpoint
CREATE INDEX `idx_pillar_registry_origin` ON `pillar_registry` (`origin`);
