# US-06: Add mise tasks for Drizzle

> PRD: [011 — Drizzle ORM](README.md)
> Status: To Review

## Description

As a developer, I want mise tasks for Drizzle operations so that schema changes and migrations are accessible via the standard task runner.

## Acceptance Criteria

- [ ] `mise drizzle:generate` runs `drizzle-kit generate` to create migrations from schema changes
- [ ] `mise drizzle:migrate` runs `drizzle-kit migrate` to apply pending migrations
- [ ] `mise drizzle:studio` runs `drizzle-kit studio` for visual DB browser (dev only)
- [ ] Tasks documented in `mise tasks` output
- [ ] Tasks work from repo root

## Notes

These tasks complement the existing `mise db:*` tasks. The existing `mise db:init` and `mise db:seed` may need updating to work with Drizzle's migration system.
