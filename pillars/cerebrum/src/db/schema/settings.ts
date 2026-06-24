/**
 * Cerebrum's federated settings table — the flat key/value store the shared
 * `@pops/pillar-settings` Read/Update/Reset surface operates over
 * (see `docs/ideas/settings-federation.md`).
 *
 * Re-exports the shared `settingsTable` factory so the cerebrum pillar owns its
 * own `settings` table in its own database, identical in shape to every other
 * federated pillar. It holds both the `cerebrum.*` and `ego.*` declared keys
 * (cerebrum serves both manifests). The `0057_settings_baseline.sql` migration
 * creates it.
 */
export { settingsTable as settings } from '@pops/pillar-settings';
