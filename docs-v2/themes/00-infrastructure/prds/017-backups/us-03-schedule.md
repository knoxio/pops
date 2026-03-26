# US-03: Scheduled backups

> PRD: [017 — Backups](README.md)
> Status: To Review

## Description

As an operator, I want backups running automatically on a daily schedule so that I don't have to remember to run them.

## Acceptance Criteria

- [ ] Systemd timer unit triggers backup script daily
- [ ] Timer runs at a low-traffic time (e.g., 3am local)
- [ ] `systemctl status pops-backup.timer` shows next scheduled run
- [ ] Systemd journal captures backup script output
- [ ] Timer deployed via Ansible

## Notes

Systemd timers over cron — better logging, better failure handling, managed by Ansible.
