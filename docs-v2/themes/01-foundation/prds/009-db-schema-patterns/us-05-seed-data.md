# US-05: Create seed data

> PRD: [009 — DB Schema Patterns](README.md)
> Status: Done

**GH Issue:** #423

## Audit Findings

**Present:**
- `mise db:seed` calls `pnpm db:seed` which runs `tsx scripts/db-seed.ts`
- `mise db:clear` calls `pnpm db:clear` which runs `tsx scripts/db-clear.ts`
- `apps/pops-api/src/db/seeder.ts` (1689 lines) seeds comprehensive data: entities, transactions (income/expenses/transfers/historical), budgets, locations tree, home inventory (electronics, furniture, tools, sports, clothing, car items), item connections, wish list, movies, TV shows with seasons and episodes, watchlist, watch history, comparison dimensions, comparisons, scores, AI usage logs
- Data is deterministic: fixed UUIDs and values, same output every run
- Edge cases covered: nullable fields (`abn: null`, `notes: null`), multiple entity types used in seeder helpers, various transaction types
- Exceeds target of ~100 records across tables

## Description

As a developer, I want a comprehensive seed dataset so that local development and e2e testing work against realistic data.

## Acceptance Criteria

- [x] `mise db:seed` populates the database with test data
- [x] `mise db:clear` removes all data but preserves schema
- [x] Seed data includes representative records across all domains (entities, transactions, budgets, inventory items, media, etc.)
- [x] Seed data is deterministic — same data every run
- [x] Seed data covers edge cases (empty fields, long strings, multiple entity types)
- [x] E2E tests can reset to seed state between runs via `mise db:seed`

## Notes

Seed data should be comprehensive enough to exercise all features but small enough to load in under a second. Target: ~100 records across all tables.
