-- N0 scaffold migration.
--
-- The entities domain schema (the real contacts tables) lands in N1; this
-- migration exists only so the boot-time migration runner has a real journal
-- to apply and the pool/pragma path is exercised end to end. It records the
-- schema bootstrap marker the health endpoint can later assert against.
CREATE TABLE IF NOT EXISTS _schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO _schema_meta (key, value) VALUES ('scaffold', 'n0');
