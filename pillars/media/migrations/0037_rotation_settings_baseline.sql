-- Media pillar baseline for the pillar-owned `rotation_settings` key/value
-- store. Rotation config (cron expression, target free space, leaving days,
-- daily additions, average movie size, protected days, enabled flag) is
-- runtime-tunable from the UI, so it needs a writable store. The media pillar
-- cannot reach `core/settings`, so it lives in this table instead. Mirrors the
-- `plex_settings` precedent.
--
-- Column types/defaults mirror the drizzle definition in
-- `src/db/schema/rotation-settings.ts`.

CREATE TABLE `rotation_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
