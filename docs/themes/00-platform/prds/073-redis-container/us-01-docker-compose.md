# US-01: Docker Compose Service

> PRD: [Redis Container & Connection](README.md)
> Status: Done

## Description

As a platform operator, I add a Redis 7 Alpine container to the Docker Compose stack on the `pops-backend` network so that backend services can use it for job queuing and caching.

## Acceptance Criteria

- [x] `redis:7-alpine` service defined in docker-compose.yml (and Ansible template)
- [x] Service is on `pops-backend` network only
- [x] Named volume `pops-redis-data` for optional persistence during restarts
- [x] Health check: `redis-cli ping` with 10s interval, 5s timeout, 3 retries
- [x] `maxmemory 256mb` and `maxmemory-policy allkeys-lru` set via command args
- [x] No ports exposed to the host (internal network only)
- [x] pops-api service declares `depends_on: redis: condition: service_healthy`
- [x] Container starts and health check passes in both local Docker and production

## Notes

Use `command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru` rather than a config file — keeps configuration visible in the compose file.
