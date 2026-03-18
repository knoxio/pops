# ADR-001: SQLite as Source of Truth

## Status

Accepted (2026-03-18)

## Context

POPS originally used Notion as the primary data store with SQLite as a sync cache. This created latency, API rate limit issues, and coupling to a third-party service.

## Decision

SQLite is the sole source of truth. Notion dependency has been fully removed.

## Consequences

- All CRUD operations are synchronous and fast
- No external API dependency for core data operations
- Single-file database simplifies backups (rclone to Backblaze B2)
- Cross-domain queries are trivial (joins within one DB)
- No horizontal scaling — acceptable for single-user system
