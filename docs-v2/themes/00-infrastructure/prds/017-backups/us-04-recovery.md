# US-04: Recovery procedure

> PRD: [017 — Backups](README.md)
> Status: To Review

## Description

As an operator, I want a documented and tested recovery procedure so that I can restore POPS from backup if the server fails.

## Acceptance Criteria

- [ ] Recovery procedure documented: download from B2, decrypt, restore volumes, restart services
- [ ] Procedure tested end-to-end: backup → wipe → restore → services running with data intact
- [ ] Document includes: rclone commands, volume restoration, service restart sequence
- [ ] Estimated recovery time documented
- [ ] Procedure accessible from outside the server (not only stored on the server being recovered)

## Notes

The recovery procedure must be accessible when the server is down — store it in the repo docs, not only on the server itself.
