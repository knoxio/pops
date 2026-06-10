CREATE TABLE `list_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`list_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`label` text NOT NULL,
	`qty` real,
	`unit` text,
	`ref_kind` text DEFAULT 'free' NOT NULL,
	`ref_id` integer,
	`checked` integer DEFAULT 0 NOT NULL,
	`checked_at` text,
	`due_at` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_list_items_ref_kind" CHECK("list_items"."ref_kind" IN ('free','ingredient','variant','recipe','custom')),
	CONSTRAINT "ck_list_items_checked" CHECK("list_items"."checked" IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `idx_list_items_list` ON `list_items` (`list_id`);--> statement-breakpoint
CREATE INDEX `idx_list_items_checked` ON `list_items` (`list_id`,`checked`);--> statement-breakpoint
-- Partial index — only non-null ref_ids participate in the polymorphic lookup.
-- Drizzle-kit's schema DSL can't express the WHERE clause; the hand-edit
-- realises PRD-112's "WHERE ref_id IS NOT NULL" requirement verbatim.
CREATE INDEX `idx_list_items_ref` ON `list_items` (`ref_kind`,`ref_id`) WHERE `ref_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`owner_app` text NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT "ck_lists_kind" CHECK("lists"."kind" IN ('shopping','packing','todo','generic'))
);
--> statement-breakpoint
CREATE INDEX `idx_lists_kind` ON `lists` (`kind`);--> statement-breakpoint
CREATE INDEX `idx_lists_owner_app` ON `lists` (`owner_app`);
