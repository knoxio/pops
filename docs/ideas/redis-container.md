# Redis: shared status surface, cache layer, key namespace

Spun out of [PRD: Redis Container & Connection](../themes/00-platform/prds/redis-container/README.md).
The container and per-pillar BullMQ connections are built. The pieces below were
specified in the original PRD but never implemented; the codebase took a
different (per-pillar, queue-only) shape instead.

## Shared connection module with status + shutdown helpers

The original spec called for a single `src/redis.ts` exporting a singleton
ioredis client plus `getRedisStatus()` (`ready` / `connecting` / `disconnected`)
and `shutdownRedis()`. That module does not exist. Each pillar instead constructs
its own ioredis client inline (food worker, food/cerebrum queue producers,
cerebrum worker) and handles shutdown locally via `connection.quit()`.

If multiple pillars start duplicating this, factor the
`resolveRedisUrl()` + `new Redis(url, { maxRetriesPerRequest: null })` +
shutdown pattern into `@pops/pillar-sdk` (a `redis` helper) rather than a
monolith module. Add a real `getRedisStatus()` driven by ioredis connection
events at that point.

## `/health` redis field

The PRD claimed `/health` would report `redis: "ok"` / `"down"`. No pillar's
HTTP `/health` carries a redis field today. What exists:

- The food worker exposes `GET /healthz` → `{ ok, queueRunning, activeJobs }` —
  no redis status.
- The registry pillar advertises a `core.redis` capability and a static
  `capabilityReporter: () => ({ redis: false })` — honest, because the registry
  container ships no Redis client, but it is not a live probe.

To deliver the original intent, add a live readiness probe (ioredis
`status === 'ready'` or a `PING`) and surface it on the owning pillar's health
endpoint and/or the registry capability reporter.

## Ephemeral cache layer

ADR-016 scoped Redis for two roles: job queue **and** ephemeral cache (AI
responses, embedding results, computed aggregations with TTL). Only the queue
role is built. No cache-aside utility, no TTL helper, no cache key convention
exists. Build this when a hot-path lookup actually needs it — not speculatively.

## `REDIS_PREFIX` key namespace

The PRD specified all keys prefixed with `pops:` (configurable via
`REDIS_PREFIX`). Not implemented — BullMQ uses its own queue-name keyspace and no
custom prefix is applied. Revisit only if a cache layer lands and the single
instance starts hosting unrelated keyspaces that need namespacing.

## `.env.example` entry

The original spec called for a `REDIS_URL=redis://localhost:6379` line in
`.env.example`. The root `.env.example` has no redis entry. Redis config currently lives in each
pillar's own `.env`; document it there (or add the line) if a unified example
file is reintroduced.
