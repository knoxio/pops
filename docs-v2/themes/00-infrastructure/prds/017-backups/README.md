# PRD-017: Backups

> Epic: [05 — Backups](../../epics/05-backups.md)
> Status: To Review

## Overview

Set up encrypted offsite backups of the SQLite database, Paperless-ngx data, and configuration files to Backblaze B2 via rclone. Scheduled via systemd timers on the server.

## What Gets Backed Up

| Data | Location | Frequency |
|------|----------|-----------|
| SQLite database | Docker volume | Daily |
| Paperless-ngx data | Docker volume | Daily |
| Media poster cache | Docker volume | Weekly (regenerable) |
| Configuration files | `/opt/pops/` | On change |

## Business Rules

- All backups encrypted before upload (rclone crypt)
- Backblaze B2 bucket with versioning enabled
- Backup schedule managed by systemd timers (not cron)
- Recovery procedure documented and tested
- Backup failures should be detectable (exit codes, logs)

## User Stories

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 01 | [us-01-rclone-setup](us-01-rclone-setup.md) | Install rclone, configure B2 remote with encryption | No (first) |
| 02 | [us-02-backup-script](us-02-backup-script.md) | Backup script that copies database, paperless, and config to B2 | Blocked by us-01 |
| 03 | [us-03-schedule](us-03-schedule.md) | Systemd timer for daily backups | Blocked by us-02 |
| 04 | [us-04-recovery](us-04-recovery.md) | Document and test recovery procedure | Blocked by us-02 |

## Verification

- Backup runs successfully to B2 (visible in B2 console)
- Backed up files are encrypted (unreadable without rclone crypt config)
- Recovery procedure tested: download from B2, decrypt, restore, services start with restored data
- Systemd timer triggers daily

## Out of Scope

- Point-in-time recovery
- Multi-region replication
- Backup monitoring dashboard
