# US-02: Backup script

> PRD: [017 — Backups](README.md)
> Status: To Review

## Description

As an operator, I want a backup script that copies the database, Paperless data, and config to B2 so that all critical data is backed up.

## Acceptance Criteria

- [ ] Backup script copies SQLite database (with `.backup` API for consistency)
- [ ] Copies Paperless-ngx data volume
- [ ] Copies configuration files from `/opt/pops/`
- [ ] Uses rclone crypt remote for encrypted upload
- [ ] Script exits with non-zero code on failure
- [ ] Logs backup start, completion, and any errors
- [ ] Old backups retained with B2 versioning

## Notes

SQLite should be backed up using the `.backup` API or by copying while the WAL is checkpointed — not by copying the file while the server is writing to it.
