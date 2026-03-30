# US-01: Docker health checks

> PRD: [018 — Monitoring](README.md)
> Status: Done

## Description

As an operator, I want Docker health checks on critical services so that unhealthy containers are automatically restarted.

## Acceptance Criteria

- [x] pops-api health check: `curl -f http://localhost:3000/health` with interval, timeout, retries
- [x] pops-shell health check: `curl -f http://localhost:80` with interval, timeout, retries
- [x] Restart policy: `restart: unless-stopped` on all services
- [x] `docker compose ps` shows `healthy` status for checked services
- [x] Killing the API process inside the container triggers a restart within the health check interval

## Notes

Health check intervals should be reasonable — every 30s with 3 retries and 10s timeout is a good starting point. Don't check too aggressively.
