# PRD-012: Hardware & OS Provisioning

> Epic: [00 — Hardware & OS](../../epics/00-hardware-os.md)
> Status: To Review

## Overview

Provision the production server from bare metal: install a Linux OS, harden security, configure SSH key-based access, set up firewall rules, and install Docker. All provisioning is automated via Ansible so a fresh machine can be fully set up from playbooks.

## Ansible Provisioning

```
infra/ansible/
  playbooks/
    site.yml              (full provisioning — OS + services)
    deploy.yml            (services only — skip OS hardening)
  inventory/
    hosts                 (server IP/hostname)
    group_vars/
      pops_servers/
        vault.yml         (encrypted secrets)
  roles/
    ...                   (per-concern roles)
```

All Ansible commands run from the `infra/ansible/` directory due to relative `roles_path`.

## Business Rules

- SSH key-based auth only — password auth disabled
- Root login disabled — use a dedicated deploy user with sudo
- Firewall allows only SSH (port 22) — all other ingress goes through Cloudflare Tunnel (no open ports)
- Ansible playbooks are idempotent — safe to re-run
- OS updates applied during provisioning

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Fresh machine | Full `site.yml` playbook: OS hardening + Docker + services |
| Existing machine, deploy only | `deploy.yml` playbook: skip OS hardening, update services |
| Lost SSH key | Physical access to machine required — document recovery procedure |

## User Stories

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 01 | [us-01-os-hardening](us-01-os-hardening.md) | Ansible role for OS hardening: SSH config, firewall, disable root, updates | No (first) |
| 02 | [us-02-docker-install](us-02-docker-install.md) | Ansible role for Docker + Docker Compose installation | Blocked by us-01 |
| 03 | [us-03-ansible-structure](us-03-ansible-structure.md) | Set up Ansible directory structure, inventory, vault, playbooks | Yes (parallel with us-01) |

## Verification

- `ansible-playbook playbooks/site.yml --syntax-check` passes
- Fresh machine is fully provisioned from playbooks
- SSH key auth works, password auth rejected
- Firewall only allows SSH
- Docker and Docker Compose installed and running

## Out of Scope

- Docker Compose service definitions (PRD-013)
- Cloudflare Tunnel setup (PRD-014)
- Application deployment
