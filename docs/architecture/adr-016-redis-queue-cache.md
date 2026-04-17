# ADR-016: Redis as Queue and Cache Backend

## Status

Accepted

## Context

POPS needs durable job processing for long-running operations: embedding generation, content consolidation, scheduled curation, and media sync beyond simple polling. The current approach uses in-memory job tracking (`sync-job-manager.ts`) that loses state on restart and cannot survive Cloudflare's 30-second request timeout for heavy operations. Additionally, AI API responses and embedding results benefit from a shared cache layer that outlives a single request but doesn't need database durability.

## Options Considered

| Option                      | Pros                                                                                | Cons                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| In-memory queues (current)  | Zero dependencies, simple                                                           | Lost on restart, no retry, no dead-letter, no visibility, single-process only                  |
| SQLite-backed job table     | No new dependency, fits "one database" philosophy                                   | Polling-based (no pub/sub), poor fit for high-throughput, write contention with main app       |
| Redis + BullMQ              | Durable queues, retry/backoff, dead-letter, pub/sub, dashboard-ready, battle-tested | New dependency (Redis container), new operational surface                                      |
| RabbitMQ                    | Full AMQP, routing, exchanges                                                       | Heavy for single-user, complex operational model, no cache capability                          |
| PostgreSQL (replace SQLite) | Queues via SKIP LOCKED, NOTIFY/LISTEN, vector support via pgvector                  | Abandons SQLite simplicity, requires migration of 28 tables, operational overhead for one user |

## Decision

Redis + BullMQ. Redis serves two roles:

1. **Job queue backend** — BullMQ provides durable, retryable job processing with dead-letter queues, priority, concurrency control, and built-in dashboard support (Bull Board). Jobs survive restarts and can run longer than the HTTP request timeout.
2. **Ephemeral cache** — AI API responses, embedding results, and computed aggregations cached with TTL. Faster than SQLite for hot-path lookups, acceptable to lose on restart (regenerated on demand).

Redis is a single additional container (~30MB memory for this workload), fits the existing Docker Compose model, and BullMQ is the standard Node.js job queue library with TypeScript support.

## Consequences

- New Docker container (`redis:7-alpine`) added to `pops-backend` network
- BullMQ workers run as a separate entry point alongside the API server (same image, different command)
- In-memory job tracking in `sync-job-manager.ts` migrates to BullMQ queues
- Ansible `pops-deploy` role updated to provision Redis volume and health check
- Redis is ephemeral-safe — losing it loses cached data and pending jobs, but no source-of-truth data. SQLite remains the single source of truth
- Backup scope unchanged — Redis data is not backed up (intentional; it's regenerable)
