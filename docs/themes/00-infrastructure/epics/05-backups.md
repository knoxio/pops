# Epic 05: Backups

> Theme: [Infrastructure](../README.md)

## Scope

Set up encrypted offsite backups of the SQLite database, Paperless-ngx data, and configuration files to Backblaze B2 via rclone. Scheduled via systemd timers.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 017 | [Backups](../prds/017-backups/README.md) | rclone configuration, B2 bucket setup, encryption, systemd timer schedule, recovery procedure | Partial |

## Dependencies

- **Requires:** Epic 01 (services and volumes must exist to back up)
- **Unlocks:** Disaster recovery capability

## Out of Scope

- Point-in-time recovery
- Backup monitoring/alerting (Epic 06)
- Multi-region replication
