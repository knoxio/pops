# US-04: Create settings table

> PRD: [009 — DB Schema Patterns](README.md)
> Status: Done

## Description

As a developer, I want a core settings table for dynamic application configuration so that user-specific values (Plex URL, sync timestamps) are stored in the database, not in environment variables.

## Acceptance Criteria

- [x] `settings` table created with `key TEXT PRIMARY KEY, value TEXT NOT NULL`
- [x] Core settings service with get/set/delete operations
- [x] Settings router with tRPC procedures
- [x] `initializeSchema()` includes the settings table
- [x] Clear distinction documented: secrets (ENV) vs settings (DB)

## Notes

Secrets are infrastructure-level (API keys, deployment config). Settings are user-level (Plex token, sync schedule, UI preferences). Secrets never go in the database. Settings never go in ENV files.
