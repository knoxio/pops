# US-04: Recovery procedure

> PRD: [017 — Backups](README.md)
> Status: Partial

## Description

As an operator, I want a documented and tested recovery procedure so that I can restore POPS from backup if the server fails.

## Acceptance Criteria

- [x] Recovery procedure documented: download from B2, decrypt, restore volumes, restart services
- [ ] Procedure tested end-to-end: backup → wipe → restore → services running with data intact
- [x] Document includes: rclone commands, volume restoration, service restart sequence
- [x] Estimated recovery time documented
- [x] Procedure accessible from outside the server (not only stored on the server being recovered)

## Notes

The recovery procedure is stored in `infra/recovery.md` in the repo — accessible when the server is down.

The backup script (`backup.sh.j2`) and restore script (`restore.sh.j2`) use Docker named volumes exclusively (no direct host-path access). The archive layout is:

```
sqlite/pops.db       paperless/data/    paperless/media/    metabase/    engrams/
```

To complete the "tested end-to-end" criterion, run a live drill:

1. Trigger a manual backup: `systemctl start pops-backup.service`
2. Verify the archive appears in B2: `rclone ls pops-b2:pops-backups/`
3. Stop services, wipe Docker volumes, restore from the archive: `/opt/pops/restore.sh pops-YYYYMMDD-HHMMSS.tar.age`
4. Confirm services come back up and data is intact (entity count, recent transactions)
