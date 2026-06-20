-- Media pillar baseline for the pillar-owned `plex_settings` key/value
-- store. The media pillar cannot reach `core/settings`, so the Plex URL,
-- encrypted token, username, client identifier, encryption seed, and
-- library section ids live in this table instead.
--
-- Column types/defaults mirror the drizzle definition in
-- `src/db/schema/plex-settings.ts`.

CREATE TABLE `plex_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
