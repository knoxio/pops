# US-01: Docker health checks

> PRD: [018 — Monitoring](README.md)
> Status: To Review

## Description

As an operator, I want Docker health checks on critical services so that unhealthy containers are automatically restarted.

## Acceptance Criteria

- [ ] pops-api health check: `curl -f http://localhost:3000/health` with interval, timeout, retries
- [ ] pops-shell health check: `curl -f http://localhost:80` with interval, timeout, retries
- [ ] Restart policy: `restart: unless-stopped` on all services
- [ ] `docker compose ps` shows `healthy` status for checked services
- [ ] Killing the API process inside the container triggers a restart within the health check interval

## Notes

Health check intervals should be reasonable — every 30s with 3 retries and 10s timeout is a good starting point. Don't check too aggressively.
