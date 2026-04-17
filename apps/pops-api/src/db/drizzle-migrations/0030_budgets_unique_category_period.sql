CREATE UNIQUE INDEX `idx_budgets_category_period` ON `budgets` (`category`, COALESCE(`period`, '__NULL__'));
