# US-01: Set up Ansible Vault

> PRD: [015 — Secrets Management](README.md)
> Status: To Review

## Description

As an operator, I want secrets encrypted in Ansible Vault so that they're stored safely in the repo and deployed securely to the server.

## Acceptance Criteria

- [ ] `inventory/group_vars/pops_servers/vault.yml` exists, encrypted with Ansible Vault
- [ ] All secrets from the inventory are stored in the vault
- [ ] `ansible-vault view` decrypts and displays secrets (with password)
- [ ] `ansible-vault encrypt` / `ansible-vault decrypt` work correctly
- [ ] Vault password location documented (not the password itself)
- [ ] Ansible playbook deploys secrets to `/opt/pops/secrets/` on the server

## Notes

The vault file is committed to the repo (encrypted). The vault password is never committed — stored securely outside the repo.
