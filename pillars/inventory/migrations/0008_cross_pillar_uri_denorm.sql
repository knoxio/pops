-- PRD-251 US-01 + US-02 — close audit H7's denormalisation half for inventory.
-- Adds soft URI references plus per-reference staleness markers so the
-- nightly reconciliation cron can record "owning pillar 404'd this id"
-- without dropping the row.
--
-- Backfill: `purchase_transaction_uri` is promoted from the legacy
-- `purchase_transaction_id` column where present; `owner_uri` starts NULL
-- because no legacy join column exists. The PRD-251 UI tolerates NULL.

ALTER TABLE `home_inventory` ADD COLUMN `purchase_transaction_uri` text;--> statement-breakpoint
ALTER TABLE `home_inventory` ADD COLUMN `purchase_transaction_stale_at` text;--> statement-breakpoint
ALTER TABLE `home_inventory` ADD COLUMN `owner_uri` text;--> statement-breakpoint
ALTER TABLE `home_inventory` ADD COLUMN `owner_stale_at` text;--> statement-breakpoint
UPDATE `home_inventory`
   SET `purchase_transaction_uri` = 'pops://finance/transaction/' || `purchase_transaction_id`
 WHERE `purchase_transaction_id` IS NOT NULL
   AND `purchase_transaction_id` <> '';--> statement-breakpoint
CREATE INDEX `idx_inventory_purchase_transaction_uri` ON `home_inventory` (`purchase_transaction_uri`);--> statement-breakpoint
CREATE INDEX `idx_inventory_owner_uri` ON `home_inventory` (`owner_uri`);
