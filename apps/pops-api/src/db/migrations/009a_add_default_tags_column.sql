-- Add default_tags column to entities if it doesn't exist.
-- Required before migration 010 which copies this column during UUID migration.
-- Also rename default_category to default_tags if the old column exists.

-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN,
-- so we check via pragma and only alter if needed.
-- However, since this migration only runs once (tracked in schema_migrations),
-- we can safely attempt the rename/add.

-- If default_category exists but default_tags doesn't, rename it
ALTER TABLE entities RENAME COLUMN default_category TO default_tags;
