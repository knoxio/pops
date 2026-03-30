# US-03: Configure health checks

> PRD: [013 — Docker Runtime](README.md)
> Status: Done

## Description

As an operator, I want health checks on critical services so that Docker automatically detects and restarts unhealthy containers.

## Acceptance Criteria

- [x] pops-api health check: HTTP GET `/health` returns 200
- [x] pops-shell health check: HTTP response from nginx
- [x] Health check intervals, timeouts, and retries configured
- [x] Restart policy: `restart: unless-stopped` on all services
- [x] `docker compose ps` shows health status for checked services
- [x] Unhealthy container is automatically restarted by Docker

## Notes

Not all services need health checks — only the ones where failure would go unnoticed. Metabase, Paperless have their own built-in health endpoints. Third-party services (metabase, paperless-ngx) rely on upstream image defaults for health monitoring.
