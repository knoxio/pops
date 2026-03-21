-- Domain: inventory
-- Description: Create item_documents junction table for linking Paperless-ngx documents to inventory items
-- Rollback: DROP TABLE IF EXISTS item_documents;

CREATE TABLE IF NOT EXISTS item_documents (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id                TEXT NOT NULL,
  paperless_document_id  INTEGER NOT NULL,
  document_type          TEXT NOT NULL,
  title                  TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES home_inventory(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_item_documents_pair ON item_documents(item_id, paperless_document_id);
CREATE INDEX IF NOT EXISTS idx_item_documents_item ON item_documents(item_id);
CREATE INDEX IF NOT EXISTS idx_item_documents_doc ON item_documents(paperless_document_id);
