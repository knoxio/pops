CREATE TABLE `tag_vocabulary` (
	`tag` text PRIMARY KEY NOT NULL,
	`source` text DEFAULT 'seed' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tag_vocabulary_active` ON `tag_vocabulary` (`is_active`);--> statement-breakpoint
INSERT OR IGNORE INTO `tag_vocabulary` (`tag`, `source`, `is_active`) VALUES
  ('Income', 'seed', 1),
  ('Transfer', 'seed', 1),
  ('Groceries', 'seed', 1),
  ('Eat Out', 'seed', 1),
  ('Coffee', 'seed', 1),
  ('Transport', 'seed', 1),
  ('Fuel', 'seed', 1),
  ('Charging', 'seed', 1),
  ('Novated Lease', 'seed', 1),
  ('Parking', 'seed', 1),
  ('Tolls', 'seed', 1),
  ('Public Transport', 'seed', 1),
  ('Shopping', 'seed', 1),
  ('Home', 'seed', 1),
  ('Online', 'seed', 1),
  ('Utilities', 'seed', 1),
  ('Internet', 'seed', 1),
  ('Mobile', 'seed', 1),
  ('Subscriptions', 'seed', 1),
  ('Entertainment', 'seed', 1),
  ('Pub', 'seed', 1),
  ('Bar', 'seed', 1),
  ('Club', 'seed', 1),
  ('Restaurant', 'seed', 1),
  ('Health', 'seed', 1),
  ('Pharmacy', 'seed', 1),
  ('Insurance', 'seed', 1),
  ('Rent', 'seed', 1),
  ('Mortgage', 'seed', 1),
  ('Travel', 'seed', 1),
  ('Education', 'seed', 1),
  ('Gifts', 'seed', 1),
  ('Donations', 'seed', 1),
  ('Fees', 'seed', 1),
  ('Interest', 'seed', 1),
  ('Taxes', 'seed', 1),
  ('Deductible', 'seed', 1),
  ('Unknown', 'seed', 1);
--> statement-breakpoint
CREATE TABLE `transaction_tag_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`description_pattern` text NOT NULL,
	`match_type` text DEFAULT 'exact' NOT NULL,
	`entity_id` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`times_applied` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_tag_rules_pattern` ON `transaction_tag_rules` (`description_pattern`);--> statement-breakpoint
CREATE INDEX `idx_tag_rules_entity_id` ON `transaction_tag_rules` (`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_tag_rules_confidence` ON `transaction_tag_rules` (`confidence`);--> statement-breakpoint
CREATE INDEX `idx_tag_rules_times_applied` ON `transaction_tag_rules` (`times_applied`);