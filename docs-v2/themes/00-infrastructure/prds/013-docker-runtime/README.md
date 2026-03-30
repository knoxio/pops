# PRD-013: Docker Runtime

> Epic: [01 — Docker Runtime](../../epics/01-docker-runtime.md)
> Status: Done

## Overview

Set up Docker Compose with multi-network architecture, service definitions, health checks, and volume management. All POPS services run as containers orchestrated by a single `docker-compose.yml`.

## Network Architecture

Three networks isolate service groups:

| Network | Purpose | Services |
|---------|---------|----------|
| `pops-frontend` | External-facing services | cloudflared, pops-shell, metabase, pops-api |
| `pops-backend` | Internal services with DB access | pops-api, moltbot, tools |
| `pops-documents` | Isolated document processing | cloudflared, paperless-ngx, paperless-redis |

`pops-api` bridges frontend and backend. `cloudflared` bridges frontend and documents.

## Services

| Service | Image | Networks | Health check |
|---------|-------|----------|-------------|
| pops-api | Custom (Node.js) | frontend, backend | HTTP `/health` |
| pops-shell | Custom (nginx) | frontend | HTTP response |
| metabase | metabase/metabase | frontend | HTTP `/api/health` |
| cloudflared | cloudflare/cloudflared | frontend, documents | — |
| moltbot | upstream moltbot image | backend | — |
| paperless-ngx | paperless-ngx | documents | — |
| paperless-redis | redis | documents | — |

## Volume Management

- SQLite database: named volume, persisted across container restarts
- Paperless-ngx data: named volume for documents and media
- Media poster cache: named volume for downloaded images
- Configuration files: bind mounts from host

## Business Rules

- All services defined in one `docker-compose.yml`
- Health checks on critical services (API, shell) — Docker restarts unhealthy containers
- Named volumes for all persistent data — never use container-local storage
- Services start in dependency order via `depends_on` with health check conditions

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-compose-file](us-01-compose-file.md) | Create docker-compose.yml with all services, networks, and volumes | Done | No (first) |
| 02 | [us-02-custom-images](us-02-custom-images.md) | Dockerfiles for pops-api and pops-shell with multi-stage builds | Done | Yes |
| 03 | [us-03-health-checks](us-03-health-checks.md) | Health check configuration for critical services, restart policies | Done | Blocked by us-01 |

## Verification

- `docker compose up -d` starts all services
- `docker compose ps` shows all services healthy
- Services communicate across correct networks (API reachable from frontend, not from documents)
- Data persists across `docker compose down && docker compose up`
- `docker compose config` validates the compose file

## Out of Scope

- Cloudflare Tunnel configuration (PRD-014)
- Secret injection (PRD-015)
- CI/CD (PRD-016)
