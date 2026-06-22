/**
 * Media's residual federated settings table — the flat key/value store for the
 * keys that have no pre-existing carve-out table (`media.*`, `radarr_*`,
 * `sonarr_*`). `plex_*` and `rotation_*` keys are NOT stored here; they route
 * to the existing `plex_settings` / `rotation_settings` tables via the
 * settings adapter (settings-federation S2; see
 * `docs/plans/02-settings-federation.md`, OD-2).
 *
 * Re-exports the shared `settingsTable` factory so the residual table is
 * identical in shape to every other federated pillar's `settings` table. The
 * `0038_settings_baseline.sql` migration creates it.
 */
export { settingsTable as settings } from '@pops/pillar-settings';
