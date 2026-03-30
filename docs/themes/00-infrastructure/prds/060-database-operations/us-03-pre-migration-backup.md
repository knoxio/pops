# US-03: Pre-migration automatic backup

> PRD: [060 — Database Operations](README.md)
> Status: Done

## Description

As an operator, I want an automatic backup of the SQLite database before any migration runs so that a bad migration can never cause unrecoverable data loss.

## Acceptance Criteria

- [x] When `runMigrations()` or Drizzle migrate detects pending migrations, a backup is created BEFORE applying them
- [x] Backup is a file copy: `{DB_PATH}.pre-migration-{timestamp}.bak` in the same directory as the database
- [x] Backup uses SQLite's `VACUUM INTO` or file copy with WAL checkpoint to ensure consistency
- [x] If all migrations succeed, the backup file is deleted (no accumulation of old backups)
- [x] If any migration fails, the backup file is preserved and its path is logged: "Migration failed. Backup available at: {path}"
- [x] If the database has no data (fresh install), backup is skipped (no point backing up empty schema)
- [x] Backup is skipped if there are no pending migrations (server starts normally, no unnecessary I/O)
- [x] Log line on backup: `[db] Backing up database before applying N migration(s)...`
- [x] Log line on cleanup: `[db] All migrations applied successfully. Backup removed.`
- [x] Tests cover: backup created when migrations pending, backup deleted on success, backup preserved on failure, backup skipped when no pending migrations

## Notes

`VACUUM INTO` is preferred over file copy because it creates a consistent snapshot even if WAL mode has uncommitted pages. However, it requires SQLite 3.27+ — verify the `better-sqlite3` version supports it. Fallback: `PRAGMA wal_checkpoint(TRUNCATE)` then file copy.

This is a local safety net, not a replacement for the offsite backup system (PRD-017). The offsite backup runs on a schedule; this runs on every server startup that has pending migrations.
