# US-04: Development Environment

> PRD: [Redis Container & Connection](README.md)
> Status: Done

## Description

As a developer, I start Redis locally with a single command so that I can develop and test features that depend on job queues or caching.

## Acceptance Criteria

- [x] `mise redis:start` runs `docker run -d --name pops-redis -p 6379:6379 redis:7-alpine redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru`
- [x] `mise redis:stop` stops and removes the container
- [x] `mise redis:cli` opens `redis-cli` against the local instance
- [x] `.env.example` updated with `REDIS_URL=redis://localhost:6379`
- [x] `mise dev` continues to work without Redis (API starts in degraded mode)
- [x] README or AGENTS.md updated with Redis dev setup instructions

## Notes

Redis is optional for development — features that depend on it degrade gracefully. Developers only need Redis when working on job queue or cache features.
