# US-05: Create seed data

> PRD: [009 — DB Schema Patterns](README.md)
> Status: To Review

## Description

As a developer, I want a comprehensive seed dataset so that local development and e2e testing work against realistic data.

## Acceptance Criteria

- [ ] `mise db:seed` populates the database with test data
- [ ] `mise db:clear` removes all data but preserves schema
- [ ] Seed data includes representative records across all domains (entities, transactions, budgets, inventory items, media, etc.)
- [ ] Seed data is deterministic — same data every run
- [ ] Seed data covers edge cases (empty fields, long strings, multiple entity types)
- [ ] E2E tests can reset to seed state between runs via `mise db:seed`

## Notes

Seed data should be comprehensive enough to exercise all features but small enough to load in under a second. Target: ~100 records across all tables.
