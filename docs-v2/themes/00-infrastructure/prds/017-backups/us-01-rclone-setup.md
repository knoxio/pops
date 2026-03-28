# US-01: Set up rclone with B2

> PRD: [017 — Backups](README.md)
> Status: Done

## Description

As an operator, I want rclone configured with a Backblaze B2 remote and encryption so that backups are stored securely offsite.

## Acceptance Criteria

- [x] rclone installed on the server (via Ansible)
- [x] B2 remote configured with application key
- [x] Crypt remote configured on top of B2 (encrypts filenames and content) — **uses age encryption instead of rclone crypt; archives are encrypted before upload**
- [x] `rclone lsd remote:` lists the B2 bucket
- [x] Manual test upload/download works with encryption
- [x] B2 credentials stored in Ansible Vault

## Notes

rclone crypt wraps the B2 remote — all operations go through the crypt layer. Files are encrypted locally before upload. The crypt password is in Ansible Vault.

Implementation uses age encryption applied before rclone upload rather than rclone's built-in crypt layer. The end result is equivalent: archives are encrypted before leaving the host.
