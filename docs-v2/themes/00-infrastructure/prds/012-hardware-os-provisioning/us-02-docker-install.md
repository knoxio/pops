# US-02: Docker installation

> PRD: [012 — Hardware & OS Provisioning](README.md)
> Status: To Review

## Description

As an operator, I want Docker and Docker Compose installed on the server so that all POPS services can run as containers.

## Acceptance Criteria

- [ ] Docker Engine installed from official Docker repository
- [ ] Docker Compose v2 plugin installed
- [ ] Deploy user added to `docker` group (no sudo needed for docker commands)
- [ ] Docker service enabled and running on boot
- [ ] Ansible role is idempotent

## Notes

Docker Compose v2 (plugin, not standalone binary). Installed via Ansible role.
