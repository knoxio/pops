-- PRD-025 #2550: Align budgets.active DB default with API default.
-- The CreateBudgetSchema in apps/pops-api defaults `active` to false (0).
-- The original schema defaulted to 1, so direct SQL inserts disagreed with API inserts.
-- SQLite cannot ALTER COLUMN DEFAULT, so we recreate the table preserving all rows.

PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`notion_id` text,
	`category` text NOT NULL,
	`period` text,
	`amount` real,
	`active` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`last_edited_time` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_budgets`("id", "notion_id", "category", "period", "amount", "active", "notes", "last_edited_time") SELECT "id", "notion_id", "category", "period", "amount", "active", "notes", "last_edited_time" FROM `budgets`;--> statement-breakpoint
DROP TABLE `budgets`;--> statement-breakpoint
ALTER TABLE `__new_budgets` RENAME TO `budgets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_notion_id_unique` ON `budgets` (`notion_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_budgets_category_period` ON `budgets` (`category`, COALESCE(`period`, char(0)));
