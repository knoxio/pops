-- Cerebrum-owned: denormalise `media_type` / `media_id` onto `debrief_sessions`.
--
-- Step 1 of the PR #3111 Option D split (notes/media-watch-history-mixed-tx-
-- design.md). The cross-pillar read `getDebriefByMedia` previously did
-- `INNER JOIN watch_history ON debrief_sessions.watch_history_id = watch_history.id`
-- to recover the media tuple. Once `watch_history` lives in `media.db` and
-- `debrief_sessions` lives in `cerebrum.db`, that join cannot remain a single
-- SQL statement. Carrying `(media_type, media_id)` on the session row removes
-- the join entirely.
--
-- `watch_history_id` is preserved as a soft reference and continues to satisfy
-- the existing FK while both tables share `pops.db`. The FK will be relaxed
-- when `debrief_sessions` physically moves to `cerebrum.db` in the follow-up
-- baseline migration.
--
-- Migration ownership: 'cerebrum' (see migration-ownership.ts).
ALTER TABLE `debrief_sessions` ADD `media_type` text;--> statement-breakpoint
ALTER TABLE `debrief_sessions` ADD `media_id` integer;--> statement-breakpoint
-- Backfill from watch_history so the post-migration state matches what
-- `getDebriefByMedia`'s old join would have returned.
UPDATE `debrief_sessions`
SET
  `media_type` = (SELECT `watch_history`.`media_type` FROM `watch_history` WHERE `watch_history`.`id` = `debrief_sessions`.`watch_history_id`),
  `media_id` = (SELECT `watch_history`.`media_id` FROM `watch_history` WHERE `watch_history`.`id` = `debrief_sessions`.`watch_history_id`)
WHERE `media_type` IS NULL OR `media_id` IS NULL;--> statement-breakpoint
CREATE INDEX `idx_debrief_sessions_media` ON `debrief_sessions` (`media_type`,`media_id`);
