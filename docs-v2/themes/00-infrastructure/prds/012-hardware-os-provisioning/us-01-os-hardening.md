# US-01: OS hardening

> PRD: [012 — Hardware & OS Provisioning](README.md)
> Status: To Review

## Description

As an operator, I want the server OS hardened so that the attack surface is minimised.

## Acceptance Criteria

- [ ] SSH configured: key-based auth only, password auth disabled, root login disabled
- [ ] Dedicated deploy user created with sudo access
- [ ] Firewall configured: allow SSH (port 22), deny all other inbound
- [ ] OS packages updated to latest
- [ ] Unattended security updates enabled
- [ ] Ansible role is idempotent — safe to re-run

## Notes

Firewall only needs SSH because all application traffic routes through Cloudflare Tunnel (PRD-014) which uses an outbound connection — no inbound ports needed.
