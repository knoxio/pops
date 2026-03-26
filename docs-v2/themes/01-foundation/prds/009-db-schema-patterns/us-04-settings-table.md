# US-04: Create settings table

> PRD: [009 — DB Schema Patterns](README.md)
> Status: Partial

**GH Issue:** #422

## Audit Findings

**Present:**
- `settings` table created via migration `20260322120000_settings.sql` (`key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL`)
- `initializeSchema()` includes the settings table
- Secrets vs settings distinction documented in `docs-v2/themes/01-foundation/prds/009-db-schema-patterns/README.md`

**Missing:**
- No settings service in `modules/core/` — no get/set/delete operations implemented
- No settings tRPC router — `core/index.ts` does not export a settings router

## Description

As a developer, I want a core settings table for dynamic application configuration so that user-specific values (Plex URL, sync timestamps) are stored in the database, not in environment variables.

## Acceptance Criteria

- [x] `settings` table created with `key TEXT PRIMARY KEY, value TEXT NOT NULL`
- [ ] Core settings service with get/set/delete operations
- [ ] Settings router with tRPC procedures
- [x] `initializeSchema()` includes the settings table
- [x] Clear distinction documented: secrets (ENV) vs settings (DB)

## Notes

Secrets are infrastructure-level (API keys, deployment config). Settings are user-level (Plex token, sync schedule, UI preferences). Secrets never go in the database. Settings never go in ENV files.
