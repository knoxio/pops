CREATE TABLE `home_inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`notion_id` text,
	`item_name` text NOT NULL,
	`brand` text,
	`model` text,
	`item_id` text,
	`room` text,
	`location` text,
	`type` text,
	`condition` text DEFAULT 'good',
	`in_use` integer,
	`deductible` integer,
	`purchase_date` text,
	`warranty_expires` text,
	`replacement_value` real,
	`resale_value` real,
	`purchase_transaction_id` text,
	`purchased_from_id` text,
	`purchased_from_name` text,
	`purchase_price` real,
	`asset_id` text,
	`notes` text,
	`location_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_edited_time` text NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `home_inventory_notion_id_unique` ON `home_inventory` (`notion_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_inventory_asset_id` ON `home_inventory` (`asset_id`);--> statement-breakpoint
CREATE INDEX `idx_inventory_name` ON `home_inventory` (`item_name`);--> statement-breakpoint
CREATE INDEX `idx_inventory_location` ON `home_inventory` (`location_id`);--> statement-breakpoint
CREATE INDEX `idx_inventory_type` ON `home_inventory` (`type`);--> statement-breakpoint
CREATE INDEX `idx_inventory_warranty` ON `home_inventory` (`warranty_expires`);--> statement-breakpoint
CREATE TABLE `fixtures` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`location_id` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_edited_time` text NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_fixtures_location` ON `fixtures` (`location_id`);--> statement-breakpoint
CREATE INDEX `idx_fixtures_type` ON `fixtures` (`type`);--> statement-breakpoint
CREATE INDEX `idx_fixtures_name` ON `fixtures` (`name`);--> statement-breakpoint
CREATE TABLE `item_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_a_id` text NOT NULL,
	`item_b_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`item_a_id`) REFERENCES `home_inventory`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_b_id`) REFERENCES `home_inventory`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `chk_item_connections_order` CHECK("item_connections"."item_a_id" < "item_connections"."item_b_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_item_connections_pair` ON `item_connections` (`item_a_id`,`item_b_id`);--> statement-breakpoint
CREATE INDEX `idx_item_connections_a` ON `item_connections` (`item_a_id`);--> statement-breakpoint
CREATE INDEX `idx_item_connections_b` ON `item_connections` (`item_b_id`);--> statement-breakpoint
CREATE TABLE `item_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL,
	`paperless_document_id` integer NOT NULL,
	`document_type` text NOT NULL,
	`title` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `home_inventory`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_item_documents_pair` ON `item_documents` (`item_id`,`paperless_document_id`);--> statement-breakpoint
CREATE INDEX `idx_item_documents_item` ON `item_documents` (`item_id`);--> statement-breakpoint
CREATE INDEX `idx_item_documents_doc` ON `item_documents` (`paperless_document_id`);--> statement-breakpoint
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
CREATE INDEX `idx_item_photos_item` ON `item_photos` (`item_id`);--> statement-breakpoint
CREATE TABLE `item_uploaded_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL,
	`file_name` text NOT NULL,
	`file_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`file_size` integer NOT NULL,
	`uploaded_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `home_inventory`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_item_uploaded_files_item` ON `item_uploaded_files` (`item_id`);--> statement-breakpoint
CREATE TABLE `item_fixture_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL,
	`fixture_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `home_inventory`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_item_fixture_connections_pair` ON `item_fixture_connections` (`item_id`,`fixture_id`);--> statement-breakpoint
CREATE INDEX `idx_item_fixture_conn_item` ON `item_fixture_connections` (`item_id`);--> statement-breakpoint
CREATE INDEX `idx_item_fixture_conn_fixture` ON `item_fixture_connections` (`fixture_id`);
