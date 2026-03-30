# US-01: OS hardening

> PRD: [012 — Hardware & OS Provisioning](README.md)
> Status: Done

## Description

As an operator, I want the server OS hardened so that the attack surface is minimised.

## Acceptance Criteria

- [x] SSH configured: key-based auth only, password auth disabled, root login disabled
- [x] Dedicated deploy user (`pops`) created with sudo access
- [x] Firewall configured: allow SSH (port 2222), deny all other inbound
- [x] OS packages updated to latest
- [x] Unattended security updates enabled
- [x] Ansible role is idempotent — safe to re-run

## Notes

Firewall only needs SSH because all application traffic routes through Cloudflare Tunnel (PRD-014) which uses an outbound connection — no inbound ports needed.

Deploy user is created via `playbooks/bootstrap.yml` (one-time setup). OS hardening is applied via the `common` role in `playbooks/site.yml`.
