# US-03: Document FK patterns and create schema registry

> PRD: [009 — DB Schema Patterns](README.md)
> Status: Done

## Description

As a developer, I want cross-domain FK patterns documented and a schema registry so that new domains follow consistent linking patterns.

## Acceptance Criteria

- [x] Cross-domain FK rules documented: nullable, SET NULL on delete, CASCADE on update, UUID references only
- [x] Schema registry document created listing all tables, owning domain, and cross-domain FKs
- [x] Table naming conventions documented (snake_case plural, domain prefix for new tables, no prefix for core)
- [x] Standard column patterns documented (UUID PKs, created_at, last_edited_time)
- [x] Schema registry matches the actual database schema

## Notes

The schema registry is a living document — updated whenever a migration adds or removes tables. It's the quick reference for "what tables exist and who owns them."
