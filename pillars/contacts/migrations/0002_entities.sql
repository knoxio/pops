-- The contacts `entities` table — the authoritative contact store.
--
-- Column-for-column mirror of core's `entities` schema
-- (`pillars/core/src/db/schema/entities.ts`): a contact is the superset of
-- core's + finance's entity fields. `aliases` is opaque CSV text and
-- `default_tags` opaque JSON text — both preserved byte-for-byte across the
-- wire round-trip (split/join only at the serialization boundary). `notion_id`
-- is the integration key and is UNIQUE; `owner_uri` carries the denormalized
-- backfill pointer and is indexed for the owner_uri resolution path.
CREATE TABLE entities (
    id TEXT PRIMARY KEY,
    notion_id TEXT UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'company',
    abn TEXT,
    aliases TEXT,
    default_transaction_type TEXT,
    default_tags TEXT,
    notes TEXT,
    last_edited_time TEXT NOT NULL,
    owner_uri TEXT,
    owner_uri_stale_at TEXT
);

CREATE INDEX idx_entities_owner_uri ON entities (owner_uri);
