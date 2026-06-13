CREATE TABLE `ha_entities` (
	`entity_id` text PRIMARY KEY NOT NULL,
	`domain` text NOT NULL,
	`friendly_name` text,
	`area` text,
	`device_class` text,
	`unit` text,
	`state` text NOT NULL,
	`attributes` text NOT NULL,
	`last_changed` integer NOT NULL,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ha_entities_domain` ON `ha_entities` (`domain`);--> statement-breakpoint
CREATE INDEX `idx_ha_entities_area` ON `ha_entities` (`area`);--> statement-breakpoint
CREATE INDEX `idx_ha_entities_device_class` ON `ha_entities` (`device_class`);--> statement-breakpoint
CREATE TABLE `ha_state_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_id` text NOT NULL,
	`state` text NOT NULL,
	`attributes` text NOT NULL,
	`observed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ha_state_history_entity_observed` ON `ha_state_history` (`entity_id`,`observed_at`);
