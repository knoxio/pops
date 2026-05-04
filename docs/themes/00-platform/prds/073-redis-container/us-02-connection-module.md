# US-02: Connection Module

> PRD: [Redis Container & Connection](README.md)
> Status: Done

## Description

As a backend developer, I import a Redis connection from a shared module so that any part of pops-api can use Redis without managing connection lifecycle.

## Acceptance Criteria

- [x] `src/redis.ts` exports a singleton ioredis client configured from `REDIS_URL` env var
- [x] Client uses `lazyConnect: true` — connects on first use, not on import
- [x] Auto-reconnect enabled with exponential backoff (ioredis defaults)
- [x] `getRedisStatus()` function returns current connection state (`ready`, `connecting`, `disconnected`)
- [x] `/health` endpoint includes `redis` field reflecting `getRedisStatus()`
- [x] `shutdownRedis()` exported for graceful shutdown — called from the server shutdown handler
- [x] All keys written via this client are prefixed with `pops:` (configurable via `REDIS_PREFIX`)
- [x] If `REDIS_URL` is not set, the module exports a null client and logs a warning — callers check for null before using Redis
- [x] Unit test verifies the module handles missing `REDIS_URL` without throwing

## Notes

ioredis is required by BullMQ — do not use `redis` (node-redis) to avoid maintaining two clients. See ADR-016 for the decision rationale.
