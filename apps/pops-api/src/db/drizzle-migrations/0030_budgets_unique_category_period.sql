CREATE UNIQUE INDEX IF NOT EXISTS `idx_budgets_category_period` ON `budgets` (`category`, COALESCE(`period`, char(0)));
