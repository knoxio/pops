# US-01: Set up rclone with B2

> PRD: [017 — Backups](README.md)
> Status: To Review

## Description

As an operator, I want rclone configured with a Backblaze B2 remote and encryption so that backups are stored securely offsite.

## Acceptance Criteria

- [ ] rclone installed on the server (via Ansible)
- [ ] B2 remote configured with application key
- [ ] Crypt remote configured on top of B2 (encrypts filenames and content)
- [ ] `rclone lsd remote:` lists the B2 bucket
- [ ] Manual test upload/download works with encryption
- [ ] B2 credentials stored in Ansible Vault

## Notes

rclone crypt wraps the B2 remote — all operations go through the crypt layer. Files are encrypted locally before upload. The crypt password is in Ansible Vault.
