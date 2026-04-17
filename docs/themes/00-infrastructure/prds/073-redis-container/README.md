# PRD-073: Redis Container & Connection

> Epic: [08 — Cortex Infrastructure](../../epics/08-cortex-infrastructure.md)
> Status: Not started

## Overview

Add Redis 7 to the POPS Docker stack as a shared backend for job queuing (BullMQ) and ephemeral caching. Provide a connection module in pops-api with health checks and graceful shutdown. Update Ansible provisioning to deploy and monitor Redis alongside existing services. Ensure the development environment has a zero-friction Redis setup.

## Data Model

Redis is a key-value store — no SQLite schema changes. Connection configuration is environment-based:

| Variable       | Dev default              | Production                            |
| -------------- | ------------------------ | ------------------------------------- |
| `REDIS_URL`    | `redis://localhost:6379` | `redis://redis:6379` (Docker network) |
| `REDIS_PREFIX` | `pops:`                  | `pops:`                               |

All keys are prefixed with `pops:` to namespace within the Redis instance.

## API Surface

No new tRPC procedures. Redis is internal infrastructure consumed by other modules (BullMQ, cache utilities). The `/health` endpoint is extended to include Redis connectivity status.

| Endpoint  | Change                                             |
| --------- | -------------------------------------------------- |
| `/health` | Response includes `redis: "ok"` or `redis: "down"` |

## Business Rules

- Redis is ephemeral — losing it loses cached data and pending jobs, never source-of-truth data
- The API server starts and serves requests even if Redis is unavailable (degraded mode: queues and cache disabled, logs warnings)
- Redis is on the `pops-backend` network only — not exposed to the frontend network or the public internet
- Connection uses `ioredis` (BullMQ's required Redis client)
- Graceful shutdown drains active connections before process exit

## Edge Cases

| Case                             | Behaviour                                                        |
| -------------------------------- | ---------------------------------------------------------------- |
| Redis unavailable on API startup | API starts in degraded mode, logs warning, retries connection    |
| Redis goes down mid-operation    | ioredis auto-reconnects, queued operations retry after reconnect |
| Redis memory full                | `maxmemory-policy allkeys-lru` evicts least-recently-used keys   |
| Dev environment without Docker   | `mise redis:start` runs Redis via Docker on localhost:6379       |

## User Stories

| #   | Story                                                 | Summary                                                                   | Status      | Parallelisable   |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------- | ----------- | ---------------- |
| 01  | [us-01-docker-compose](us-01-docker-compose.md)       | Add Redis 7 Alpine container to Docker Compose on pops-backend network    | Not started | No (first)       |
| 02  | [us-02-connection-module](us-02-connection-module.md) | ioredis connection module with health check, graceful shutdown, reconnect | Not started | Blocked by us-01 |
| 03  | [us-03-ansible-role](us-03-ansible-role.md)           | Ansible provisioning for Redis volume, health check, maxmemory config     | Not started | Yes              |
| 04  | [us-04-dev-environment](us-04-dev-environment.md)     | mise task for local Redis, .env.example update, dev documentation         | Not started | Yes              |

US-03 and US-04 can parallelise after US-01. US-02 depends on US-01 (needs a running Redis to connect to).

## Verification

- Redis container starts and passes Docker health check (`redis-cli ping` returns `PONG`)
- `/health` endpoint reports Redis status
- API starts successfully when Redis is unavailable (degraded mode)
- API reconnects automatically when Redis comes back
- Ansible deploys Redis with correct network, volume, and memory configuration
- `mise redis:start` launches Redis locally for development
- No secrets stored in Redis (verified by code review)

## Out of Scope

- BullMQ queue definitions (PRD-074)
- Cache utilities or cache-aside patterns (Cortex theme)
- Redis Sentinel, clustering, or replication
- Redis persistence (RDB/AOF) — ephemeral by design (ADR-016)
- Redis AUTH password (single-user, backend-network-only, no external exposure)

## Drift Check

last checked: 2026-04-17
