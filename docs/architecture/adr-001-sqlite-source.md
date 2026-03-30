# ADR-001: SQLite as Source of Truth

## Status

Accepted

## Context

POPS needs a database for a single-user, self-hosted system running on a mini PC. The typical choice would be Postgres, but the operational overhead (separate process, connection pooling, backups, upgrades) is disproportionate for a single-user workload.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| PostgreSQL | Mature, scalable, rich query features | Separate process, connection management, heavier backups, overkill for one user |
| SQLite | Zero dependencies, single file, synchronous reads, trivial backups, cross-domain joins for free | No horizontal scaling, write concurrency limited to one writer |
| Cloud DB (Supabase, PlanetScale) | Managed, no ops | External dependency, latency, ongoing cost, defeats self-hosted goal |

## Decision

SQLite is the sole source of truth. One file, one process, no external dependencies.

## Consequences

- All CRUD operations are synchronous and fast
- No external API dependency for core data operations
- Single-file database simplifies backups (rclone to Backblaze B2)
- Cross-domain queries are trivial (joins within one DB)
- No horizontal scaling — acceptable for single-user system
- Write concurrency is limited — acceptable since there's one user and no concurrent writers
