CREATE TABLE `item_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_a_id` text NOT NULL,
	`item_b_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`item_a_id`) REFERENCES `home_inventory`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_b_id`) REFERENCES `home_inventory`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_item_connections_order" CHECK("item_connections"."item_a_id" < "item_connections"."item_b_id")
);
--> statement-breakpoint
CREATE INDEX `idx_item_connections_a` ON `item_connections` (`item_a_id`);--> statement-breakpoint
CREATE INDEX `idx_item_connections_b` ON `item_connections` (`item_b_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_item_connections_pair` ON `item_connections` (`item_a_id`,`item_b_id`);--> statement-breakpoint
CREATE TABLE `item_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL,
	`file_path` text NOT NULL,
	`caption` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `home_inventory`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_item_photos_item` ON `item_photos` (`item_id`);