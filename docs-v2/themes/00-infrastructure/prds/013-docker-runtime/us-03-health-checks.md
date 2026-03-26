# US-03: Configure health checks

> PRD: [013 — Docker Runtime](README.md)
> Status: To Review

## Description

As an operator, I want health checks on critical services so that Docker automatically detects and restarts unhealthy containers.

## Acceptance Criteria

- [ ] pops-api health check: HTTP GET `/health` returns 200
- [ ] pops-shell health check: HTTP response from nginx
- [ ] Health check intervals, timeouts, and retries configured
- [ ] Restart policy: `restart: unless-stopped` on all services
- [ ] `docker compose ps` shows health status for checked services
- [ ] Unhealthy container is automatically restarted by Docker

## Notes

Not all services need health checks — only the ones where failure would go unnoticed. Metabase, Paperless have their own built-in health endpoints.
