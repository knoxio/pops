# US-03: Ansible directory structure

> PRD: [012 — Hardware & OS Provisioning](README.md)
> Status: Done

## Description

As an operator, I want the Ansible directory structure set up with inventory, vault, and playbooks so that provisioning is organised and secrets are encrypted.

## Acceptance Criteria

- [x] `infra/ansible/` directory with playbooks, inventory, roles structure
- [x] `playbooks/site.yml` — full provisioning (OS + Docker + services)
- [x] `playbooks/deploy.yml` — services only (skip OS hardening)
- [x] `inventory/hosts` with server configuration
- [x] `inventory/group_vars/pops_servers/vault.yml` encrypted with Ansible Vault
- [x] `ansible-playbook playbooks/site.yml --syntax-check` passes
- [x] Vault password documented (location, not the password itself)

## Notes

All Ansible commands must run from `infra/ansible/` due to relative `roles_path`. Document this clearly.
