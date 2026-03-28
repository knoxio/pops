# Epic 01: Docker Runtime

> Theme: [Infrastructure](../README.md)

## Scope

Set up Docker Compose with multi-network architecture, service definitions, health checks, and volume management. After this epic, all POPS services can run as containers on the production server.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 013 | [Docker Runtime](../prds/013-docker-runtime/README.md) | Compose file, 3 networks (frontend/backend/documents), service definitions, health checks, volumes | Partial |

## Dependencies

- **Requires:** Epic 00 (provisioned machine with Docker installed)
- **Unlocks:** Epic 02 (networking needs running services), Epics 03-06

## Out of Scope

- Cloudflare Tunnel configuration (Epic 02)
- Secret injection (Epic 03)
- CI/CD (Epic 04)
