-- sqlite-vec virtual table for k-NN vector similarity search.
-- Virtual tables are not supported by Drizzle's schema builder — created via raw SQL.
-- rowid matches embeddings.id for metadata joins.
-- Dimension fixed at 1536 (text-embedding-3-small default).
-- Changing the embedding model to one with different dimensions requires a full
-- re-index: drop this table, recreate with the new dimension, and re-embed all content.
-- Requires the sqlite-vec extension to be loaded before this migration runs.
CREATE VIRTUAL TABLE IF NOT EXISTS `embeddings_vec` USING vec0(vector float[1536]);
