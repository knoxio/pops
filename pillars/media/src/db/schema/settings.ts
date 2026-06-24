/**
 * Media's residual settings table — the flat key/value store for the keys that
 * have no carve-out table (`media.*`, `radarr_*`, `sonarr_*`). `plex_*` and
 * `rotation_*` keys are NOT stored here; the settings adapter routes them to
 * the `plex_settings` / `rotation_settings` tables instead.
 *
 * Re-exports the shared `settingsTable` factory so this table is identical in
 * shape to every other pillar's `settings` table. The
 * `0038_settings_baseline.sql` migration creates it.
 */
export { settingsTable as settings } from '@pops/pillar-settings';
