# US-01: Create Docker Compose file

> PRD: [013 — Docker Runtime](README.md)
> Status: To Review

## Description

As an operator, I want a single docker-compose.yml that defines all POPS services, networks, and volumes so that the entire stack starts with one command.

## Acceptance Criteria

- [ ] `infra/docker-compose.yml` defines all services (pops-api, pops-shell, metabase, cloudflared, moltbot, paperless-ngx, paperless-redis)
- [ ] Three networks defined: pops-frontend, pops-backend, pops-documents
- [ ] Each service assigned to correct network(s)
- [ ] Named volumes for persistent data (database, paperless, poster cache)
- [ ] `depends_on` with health check conditions for startup ordering
- [ ] `docker compose config` validates without errors
- [ ] `docker compose up -d` starts all services

## Notes

pops-api bridges frontend and backend networks. cloudflared bridges frontend and documents. No other cross-network connections.
