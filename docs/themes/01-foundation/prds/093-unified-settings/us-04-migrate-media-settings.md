# US-04: Migrate Media Settings

> PRD: [PRD-093: Unified Settings System](README.md)

## Description

As a user, I want Plex, Arr, and Rotation settings to appear in the unified settings page so that I can manage all media configuration from `/settings` instead of navigating to separate app-specific pages.

## Acceptance Criteria

### Plex Manifest (`media.plex`, order: 100)

- [ ] Manifest is defined in the `@pops/app-media` package with `id: 'media.plex'`, `title: 'Plex'`, and `order: 100`
- [x] **Connection group**: `plex_url` (url field), `plex_token` (password field with `sensitive: true` and `testAction` calling `media.plex.testConnection` with label "Test Connection")
- [x] **Library group**: `plex_movie_section_id` (select field), `plex_tv_section_id` (select field) — options loaded dynamically via an async options loader that calls `media.plex.getSections`
- [x] **Sync group**: `plex_scheduler_enabled` (toggle field), `plex_scheduler_interval_ms` (duration field)

### Arr Manifest (`media.arr`, order: 110)

- [x] Manifest is defined in the API media module with `id: 'media.arr'`, `title: 'Arr'`, and `order: 110`
- [x] **Radarr group**: `radarr_url` (url field), `radarr_api_key` (password field with `sensitive: true` and `testAction` calling `media.arr.testRadarr` with label "Test Radarr")
- [x] **Sonarr group**: `sonarr_url` (url field), `sonarr_api_key` (password field with `sensitive: true` and `testAction` calling `media.arr.testSonarr` with label "Test Sonarr")

### Rotation Manifest (`media.rotation`, order: 120)

- [x] Manifest is defined in the API media module with `id: 'media.rotation'`, `title: 'Rotation'`, and `order: 120`
- [x] **Schedule group**: `rotation_enabled` (toggle field), `rotation_cron_expression` (text field)
- [x] **Capacity group**: `rotation_target_free_gb` (number field), `rotation_avg_movie_gb` (number field)
- [x] **Protection group**: `rotation_protected_days` (number field), `rotation_daily_additions` (number field), `rotation_leaving_days` (number field)

### Registration

- [x] All three manifests are registered via `settingsRegistry.register()` in the media API module initialization
- [x] Registration happens at API startup alongside other media module setup

### Route Redirects

- [x] `/media/plex` redirects to `/settings#media.plex`
- [x] `/media/arr` redirects to `/settings#media.arr`
- [x] `/media/rotation` redirects to `/settings#media.rotation`

### Cleanup

- [x] `PlexSettingsPage`, `ArrSettingsPage`, and `RotationSettingsPage` components are removed (not deprecated — fully deleted)
- [x] No dead imports or references to the removed components remain

### Dynamic Select Options

- [x] The Plex library section selects (`plex_movie_section_id`, `plex_tv_section_id`) use the `optionsLoaders` pattern from US-03 (wired in SettingsPage)
- [x] If `getSections` fails (e.g., Plex not connected), the selects show an appropriate error state

## Notes

- The Plex PIN-based auth flow (initial setup wizard) is not part of this migration. It remains as a separate flow. The settings page only manages already-configured connections.
- Rotation settings are currently stored in domain-specific tables, not the generic `settings` table. Two approaches:
  - **(a)** Migrate rotation data into the `settings` table with `rotation_` prefix keys.
  - **(b)** The rotation manifest fields use a custom `procedure` override that reads/writes from the existing rotation tables.
  - Option (b) is simpler and avoids a data migration. The `SettingsField` type may need an optional `procedure` override (a `{ get: string; set: string }` pair pointing to tRPC procedures) for fields that don't use the generic `settings` table. If this pattern is needed, coordinate with US-01 to add it to the type.
- The `testAction` procedures (`media.plex.testConnection`, `media.arr.testRadarr`, `media.arr.testSonarr`) already exist — this story wires them into the manifest, it does not re-implement them.
