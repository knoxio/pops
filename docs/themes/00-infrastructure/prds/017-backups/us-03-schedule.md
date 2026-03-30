# US-03: Scheduled backups

> PRD: [017 — Backups](README.md)
> Status: Done

## Description

As an operator, I want backups running automatically on a daily schedule so that I don't have to remember to run them.

## Acceptance Criteria

- [x] Systemd timer unit triggers backup script daily
- [x] Timer runs at a low-traffic time (e.g., 3am local)
- [x] `systemctl status pops-backup.timer` shows next scheduled run
- [x] Systemd journal captures backup script output
- [x] Timer deployed via Ansible

## Notes

Systemd timers over cron — better logging, better failure handling, managed by Ansible.
