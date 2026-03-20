ALTER TABLE `home_inventory` ADD `asset_id` text;--> statement-breakpoint
ALTER TABLE `home_inventory` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `home_inventory` ADD `location_id` text REFERENCES locations(id);--> statement-breakpoint
CREATE UNIQUE INDEX `home_inventory_asset_id_unique` ON `home_inventory` (`asset_id`);--> statement-breakpoint
CREATE INDEX `idx_inventory_asset_id` ON `home_inventory` (`asset_id`);--> statement-breakpoint
CREATE INDEX `idx_inventory_name` ON `home_inventory` (`item_name`);--> statement-breakpoint
CREATE INDEX `idx_inventory_location` ON `home_inventory` (`location_id`);--> statement-breakpoint
CREATE INDEX `idx_inventory_type` ON `home_inventory` (`type`);