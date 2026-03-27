# US-04: Recovery procedure

> PRD: [017 — Backups](README.md)
> Status: Done

## Description

As an operator, I want a documented and tested recovery procedure so that I can restore POPS from backup if the server fails.

## Acceptance Criteria

- [x] Recovery procedure documented: download from B2, decrypt, restore volumes, restart services
- [ ] Procedure tested end-to-end: backup → wipe → restore → services running with data intact
- [x] Document includes: rclone commands, volume restoration, service restart sequence
- [x] Estimated recovery time documented
- [x] Procedure accessible from outside the server (not only stored on the server being recovered)

## Notes

The recovery procedure must be accessible when the server is down — store it in the repo docs, not only on the server itself.
