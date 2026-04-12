ALTER TABLE `transaction_corrections` ADD `priority` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_corrections_priority` ON `transaction_corrections` (`priority`);--> statement-breakpoint
ALTER TABLE `transaction_tag_rules` ADD `priority` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_tag_rules_priority` ON `transaction_tag_rules` (`priority`);--> statement-breakpoint
-- Backfill transaction_corrections: exact → 0-999, contains → 1000-1999, regex → 2000-2999
-- Within each band, order by confidence DESC, times_applied DESC, gaps of 10
UPDATE `transaction_corrections`
SET `priority` = (
  SELECT
    CASE tc2.match_type
      WHEN 'exact' THEN 0
      WHEN 'contains' THEN 1000
      WHEN 'regex' THEN 2000
      ELSE 0
    END + (row_num - 1) * 10
  FROM (
    SELECT
      id,
      match_type,
      ROW_NUMBER() OVER (
        PARTITION BY match_type
        ORDER BY confidence DESC, times_applied DESC
      ) AS row_num
    FROM `transaction_corrections`
  ) tc2
  WHERE tc2.id = `transaction_corrections`.id
);--> statement-breakpoint
-- Backfill transaction_tag_rules: exact → 0-999, contains → 1000-1999, regex → 2000-2999
UPDATE `transaction_tag_rules`
SET `priority` = (
  SELECT
    CASE tr2.match_type
      WHEN 'exact' THEN 0
      WHEN 'contains' THEN 1000
      WHEN 'regex' THEN 2000
      ELSE 0
    END + (row_num - 1) * 10
  FROM (
    SELECT
      id,
      match_type,
      ROW_NUMBER() OVER (
        PARTITION BY match_type
        ORDER BY confidence DESC, times_applied DESC
      ) AS row_num
    FROM `transaction_tag_rules`
  ) tr2
  WHERE tr2.id = `transaction_tag_rules`.id
);