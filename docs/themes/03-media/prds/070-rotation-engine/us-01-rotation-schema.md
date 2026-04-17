# US-01: Rotation Schema

> PRD: [Rotation Engine](README.md)

## Description

As a system, I need the database schema for rotation state tracking so that movies can be marked as leaving, protected, or eligible, and rotation cycles can be logged.

## Acceptance Criteria

- [x] `movies` table has new nullable columns: `rotation_status` (text), `rotation_expires_at` (text), `rotation_marked_at` (text)
- [x] `rotation_log` table exists with columns per PRD data model: `id`, `executed_at`, `movies_marked_leaving`, `movies_removed`, `movies_added`, `removals_failed`, `free_space_gb`, `target_free_gb`, `skipped_reason`, `details`
- [x] Rotation config keys are documented and retrievable from the settings table (no new table — reuse existing k-v settings pattern)
- [x] Migration is idempotent and does not affect existing movie data (all new columns default to `null`)
- [x] Drizzle schema types are exported from `@pops/db-types`

## Notes

Follow the existing migration pattern in `apps/pops-api/src/db/migrations/`. The settings keys (`rotation_enabled`, `rotation_cron_expression`, etc.) are inserted on first access, not via migration — consistent with how Plex/Radarr settings work.
