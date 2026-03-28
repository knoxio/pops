# US-02: Docker installation

> PRD: [012 — Hardware & OS Provisioning](README.md)
> Status: Done

## Description

As an operator, I want Docker and Docker Compose installed on the server so that all POPS services can run as containers.

## Acceptance Criteria

- [x] Docker Engine installed from official Docker repository
- [x] Docker Compose v2 plugin installed
- [x] Deploy user added to `docker` group (no sudo needed for docker commands)
- [x] Docker service enabled and running on boot
- [x] Ansible role is idempotent

## Notes

Docker Compose v2 (plugin, not standalone binary). Installed via Ansible role.
