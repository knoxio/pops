# US-02: Backup script

> PRD: [017 — Backups](README.md)
> Status: Done

## Description

As an operator, I want a backup script that safely copies the database, paperless data, and config files to B2 so that data is protected against loss.

## Acceptance Criteria

- [x] Backup script creates SQLite online backup (safe with WAL mode)
- [x] Script bundles database, paperless data, and config files into a tar archive
- [x] Archive encrypted before upload (age encryption with passphrase)
- [x] Encrypted archive uploaded to B2 via rclone
- [x] Local temp files cleaned up after upload
- [x] Script uses strict error handling (`set -euo pipefail`)
- [x] Script deployed via Ansible to `/opt/pops/backup.sh`

## Notes

Deployed from `infra/ansible/roles/backups/templates/backup.sh.j2`. Script is mode 0700, root-owned. Timestamped filenames: `pops-YYYYMMDD-HHMMSS.tar.age`.
