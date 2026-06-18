CREATE TABLE `pillar_registry` (
	`pillar_id` text PRIMARY KEY NOT NULL,
	`base_url` text NOT NULL,
	`manifest_json` text NOT NULL,
	`contract_package` text NOT NULL,
	`contract_version` text NOT NULL,
	`contract_tag` text NOT NULL,
	`registered_at` text NOT NULL,
	`last_heartbeat_at` text NOT NULL,
	`status` text NOT NULL,
	`status_updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pillar_registry_status` ON `pillar_registry` (`status`);
