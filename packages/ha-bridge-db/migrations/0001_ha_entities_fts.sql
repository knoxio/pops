-- FTS5 index over `ha_entities` for the HA bridge pillar's search adapter
-- (PRD-229 US-02).
--
-- The base table uses `entity_id` TEXT as its primary key, so we can't
-- bind FTS5's rowid to the base table via `content=`. Instead we run a
-- standalone FTS5 table and keep it in sync with INSERT/UPDATE/DELETE
-- triggers. The triggers mirror the columns the search adapter ranks
-- against: `entity_id` (so `kitchen_temperature` matches even without a
-- friendly name), `friendly_name`, `domain`, `area`, `device_class`,
-- and a derived `attributes_searchable` column that flattens the most
-- search-useful HA attributes (`friendly_name`, `device_class`, area
-- aliases) for prefix / token matching.
--
-- Tokeniser: `unicode61 remove_diacritics 2` so "café" matches "cafe"
-- and accented HA areas / device names tokenise consistently with the
-- rest of POPS (existing pillars use the same default).

CREATE VIRTUAL TABLE `ha_entities_fts` USING fts5(
	entity_id,
	friendly_name,
	domain,
	area,
	device_class,
	attributes_searchable,
	tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `ha_entities_fts_ai` AFTER INSERT ON `ha_entities` BEGIN
	INSERT INTO `ha_entities_fts` (entity_id, friendly_name, domain, area, device_class, attributes_searchable)
	VALUES (
		new.entity_id,
		COALESCE(new.friendly_name, ''),
		new.domain,
		COALESCE(new.area, ''),
		COALESCE(new.device_class, ''),
		COALESCE(new.friendly_name, '') || ' ' || COALESCE(new.device_class, '') || ' ' || COALESCE(new.unit, '')
	);
END;
--> statement-breakpoint
CREATE TRIGGER `ha_entities_fts_ad` AFTER DELETE ON `ha_entities` BEGIN
	DELETE FROM `ha_entities_fts` WHERE entity_id = old.entity_id;
END;
--> statement-breakpoint
CREATE TRIGGER `ha_entities_fts_au` AFTER UPDATE ON `ha_entities` BEGIN
	DELETE FROM `ha_entities_fts` WHERE entity_id = old.entity_id;
	INSERT INTO `ha_entities_fts` (entity_id, friendly_name, domain, area, device_class, attributes_searchable)
	VALUES (
		new.entity_id,
		COALESCE(new.friendly_name, ''),
		new.domain,
		COALESCE(new.area, ''),
		COALESCE(new.device_class, ''),
		COALESCE(new.friendly_name, '') || ' ' || COALESCE(new.device_class, '') || ' ' || COALESCE(new.unit, '')
	);
END;
