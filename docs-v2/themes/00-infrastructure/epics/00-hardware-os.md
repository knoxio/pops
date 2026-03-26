# Epic 00: Hardware & OS

> Theme: [Infrastructure](../README.md)

## Scope

Provision the production server: install OS, harden security, configure SSH access, set up firewall. After this epic, the machine is secure, accessible, and ready for Docker.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 012 | [Hardware & OS Provisioning](../prds/012-hardware-os-provisioning/README.md) | OS installation, SSH key auth, firewall rules, OS hardening via Ansible | Done |

## Dependencies

- **Requires:** Nothing — first thing to set up
- **Unlocks:** Epic 01 (Docker needs a provisioned machine)

## Out of Scope

- Docker installation (Epic 01)
- Network ingress (Epic 02)
- Application deployment
