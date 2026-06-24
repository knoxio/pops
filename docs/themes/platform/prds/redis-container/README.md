# Redis Container & Connection

> Theme: [Platform](../../README.md)
> Status: Done
> See: [ADR-016 — Redis as Queue and Cache Backend](../../../../architecture/adr-016-redis-queue-cache.md)

## Overview

A single `redis:7-alpine` container, `pops-redis`, runs on the backend Docker
network as the shared BullMQ job-queue backend for the pillars that ship
workers (food, cerebrum). It is ephemeral by design: losing it loses queued
jobs and any cached value, never source-of-truth data — each pillar's SQLite DB
remains the only durable store (ADR-016).

There is no shared `pops-api` and no shared connection library. Each pillar that
needs Redis opens its own ioredis client from env, scoped to that pillar's
worker and queue producers. A pillar with no Redis configured runs in degraded
mode: its queue producers return `null`, enqueue endpoints answer `503`, and the
worker exits cleanly instead of crashing.

Server-side provisioning (volumes, host config) is the deployer's concern and
lives outside this repo in the homelab infra.

## Container

| Property       | Value                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------- |
| Service        | `pops-redis`                                                                              |
| Image          | `redis:7-alpine`                                                                          |
| Network        | `backend` (named `pops-backend`) only — no host ports, not public                         |
| Volume         | `pops-redis-data:/data` (named; survives container restart)                               |
| Command        | `redis-server --save "" --appendonly no --maxmemory 256mb --maxmemory-policy allkeys-lru` |
| Persistence    | **Off** — RDB snapshotting (`--save ""`) and AOF (`--appendonly no`) disabled             |
| Eviction       | `allkeys-lru` at 256 MB ceiling                                                           |
| Healthcheck    | `redis-cli ping`, interval 10s, timeout 5s, retries 3                                     |
| Restart policy | `unless-stopped`                                                                          |

Defined identically in `infra/docker-compose.yml` and
`infra/docker-compose.dev.yml`.

> The volume is mounted but persistence is deliberately disabled at the
> `redis-server` level. The volume exists so a container restart does not error
> on a missing mount, not to persist data — there is nothing to persist.

## Connection Configuration

Env-based, resolved per pillar at runtime. Two equivalent forms are accepted; a
full URL wins over host/port:

| Variable     | Dev default              | Production                       |
| ------------ | ------------------------ | -------------------------------- |
| `REDIS_URL`  | `redis://localhost:6379` | `redis://pops-redis:6379`        |
| `REDIS_HOST` | —                        | `pops-redis` (cerebrum services) |
| `REDIS_PORT` | —                        | `6379`                           |

Resolution order in each consumer: if `REDIS_URL` is set and non-empty, use it;
else if `REDIS_HOST` is set, build `redis://<host>:<REDIS_PORT ?? 6379>`; else
return `null` (Redis unconfigured → degraded mode). The food worker's
`loadConfig()` additionally defaults `REDIS_URL` to `redis://localhost:6379` when
nothing is set, so a local worker run targets a locally started Redis.

Consumers that take `REDIS_URL` in production: `food-api` (and its worker).
Consumers that take `REDIS_HOST`/`REDIS_PORT`: `cerebrum-api`, `cerebrum-worker`.

ioredis is the mandated client — BullMQ requires it. Every client is constructed
with `maxRetriesPerRequest: null`; BullMQ uses blocking commands and ioredis's
default retry-on-timeout fights them, causing spurious disconnects.

## Startup Ordering

Pillars that need Redis declare a healthcheck dependency in compose:

```yaml
depends_on:
  pops-redis:
    condition: service_healthy
```

Declared by `food-api`, `cerebrum-api`, and `cerebrum-worker`. The container must
report healthy (`redis-cli ping` → `PONG`) before these services start.

## Business Rules

- Redis is ephemeral — losing it loses cached data and pending jobs, never
  source-of-truth data (which lives in per-pillar SQLite).
- A pillar starts and serves requests even when Redis is unavailable (degraded
  mode): queue producers return `null`, enqueue/retry endpoints answer `503`,
  workers log a warning and exit cleanly.
- Redis is on the `backend` network only — never exposed to the frontend network
  or the public internet, no host port binding.
- All Redis clients use `ioredis` with `maxRetriesPerRequest: null` (BullMQ
  requirement).
- ioredis auto-reconnects with exponential backoff (library defaults) when the
  connection drops mid-operation.
- Graceful shutdown: a worker drains active jobs (`worker.close()`, bounded by a
  per-pillar drain timeout) then calls `connection.quit()` before exit.
- No AUTH password: single-user, backend-network-only, no external exposure.

## Edge Cases

| Case                              | Behaviour                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Redis unconfigured on pillar boot | Queue producers return `null`; enqueue/retry endpoints answer `503`; worker exits clean                 |
| Redis unavailable mid-operation   | ioredis auto-reconnects (exponential backoff); BullMQ jobs retry after reconnect                        |
| Redis memory full                 | `maxmemory-policy allkeys-lru` evicts least-recently-used keys at 256 MB                                |
| Dev environment without Docker    | `mise redis:start` runs Redis on `localhost:6379`                                                       |
| Cancel an in-flight job           | API removes the BullMQ row; the worker's cooperative state check returns `'unknown'` and short-circuits |

## Development

| Task               | Effect                                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mise redis:start` | `docker run -d --name pops-redis -p 6379:6379 redis:7-alpine redis-server --save "" --appendonly no --maxmemory 256mb --maxmemory-policy allkeys-lru` |
| `mise redis:stop`  | `docker rm -f pops-redis`                                                                                                                             |
| `mise redis:cli`   | `docker exec -it pops-redis redis-cli`                                                                                                                |

Set `REDIS_URL=redis://localhost:6379` in the relevant pillar's `.env` when
working on job-queue features. Redis is optional for most pillars; only the food
and cerebrum workers require it. `mise dev` works without Redis — affected
pillars degrade gracefully. Dev setup is documented in `AGENTS.md`.

## Acceptance Criteria

### Container

- [x] `redis:7-alpine` service `pops-redis` defined in both `docker-compose.yml` and `docker-compose.dev.yml`
- [x] Service is on the `backend` (`pops-backend`) network only
- [x] Named volume `pops-redis-data` mounted at `/data`
- [x] Healthcheck `redis-cli ping` — 10s interval, 5s timeout, 3 retries
- [x] `maxmemory 256mb` and `maxmemory-policy allkeys-lru` set via command args
- [x] No host ports exposed (internal network only)
- [x] Consumers (`food-api`, `cerebrum-api`, `cerebrum-worker`) declare `depends_on: pops-redis: condition: service_healthy`
- [x] Persistence disabled at the server level (`--save ""`, `--appendonly no`) — ephemeral by design (ADR-016)

### Connection

- [x] Consumers construct an `ioredis` client from `REDIS_URL` (or `REDIS_HOST`/`REDIS_PORT`)
- [x] Every client uses `maxRetriesPerRequest: null` (BullMQ requirement)
- [x] Auto-reconnect with exponential backoff (ioredis defaults)
- [x] When no Redis env is set, queue producers return `null` and the pillar runs in degraded mode without throwing at module init
- [x] Enqueue/retry endpoints answer `503` when the queue is unavailable
- [x] Graceful shutdown drains active jobs then calls `connection.quit()` before exit
- [x] Unit tests cover the no-Redis degradation path (food: 503 on enqueue/retry; worker `loadConfig` defaults `REDIS_URL`)

### Development

- [x] `mise redis:start` runs Redis on `localhost:6379`
- [x] `mise redis:stop` removes the container
- [x] `mise redis:cli` opens `redis-cli` against the local instance
- [x] `mise dev` works without Redis (affected pillars degrade gracefully)
- [x] `AGENTS.md` documents Redis dev setup

## Out of Scope

- BullMQ queue definitions and worker logic ([Job Queue Infrastructure](../job-queue/README.md))
- Cache utilities / cache-aside patterns (not built — see ideas)
- A shared `getRedisStatus()` / `shutdownRedis()` connection library; a
  `/health` endpoint reporting `redis: ok|down`; a `REDIS_PREFIX` key namespace
  (none of these are built — see `docs/ideas/redis-container.md`)
- Redis Sentinel, clustering, replication
- Redis persistence (RDB/AOF) — ephemeral by design (ADR-016)
- Redis AUTH password (single-user, backend-network-only)
- Server-side provisioning (deployer's concern, out of repo)
