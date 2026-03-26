# US-03: Migrate core module to Drizzle

> PRD: [011 — Drizzle ORM](README.md)
> Status: To Review

## Description

As a developer, I want the core module (entities, ai-usage, settings, corrections, envs) using Drizzle queries so that they serve as the reference implementation for other modules.

## Acceptance Criteria

- [ ] All `db.prepare(sql).all()` calls in core services replaced with Drizzle query builder
- [ ] No `as Row[]` type casts remain in core module
- [ ] All core module tests pass with Drizzle queries
- [ ] Types come from Drizzle inference, not manual definitions
- [ ] Core serves as the reference pattern for other module migrations

## Notes

Core module is the reference implementation — migrate it first so other modules can copy the pattern. Entity service is the most complex (aliases, type filtering, cross-domain references).
