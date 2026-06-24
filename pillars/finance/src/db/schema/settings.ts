/**
 * Finance's federated settings table — the flat key/value store the shared
 * `@pops/pillar-settings` Read/Update/Reset surface operates over.
 *
 * Re-exports the shared `settingsTable` factory so the finance pillar owns its
 * own `settings` table in its own database, identical in shape to every other
 * federated pillar. The `0056_settings_baseline.sql` migration creates it.
 */
export { settingsTable as settings } from '@pops/pillar-settings';
