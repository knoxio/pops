# US-04: Migrate finance module to Drizzle

> PRD: [011 — Drizzle ORM](README.md)
> Status: Partial

## Description

As a developer, I want the finance module (transactions, budgets, imports, wishlist) using Drizzle queries so that the largest module benefits from type-safe database access.

## Acceptance Criteria

- [x] All raw SQL in finance services replaced with Drizzle query builder
- [ ] No `as Row[]` type casts remain in finance module — **test files still use raw SQL**
- [ ] All finance module tests pass — **test code still uses raw SQL patterns**
- [x] Import pipeline (entity matcher, dedup) works correctly with Drizzle
- [x] Complex queries (filtered transaction lists, budget aggregations) produce correct results

## Notes

Finance has the most complex queries (filtered/sorted transaction lists, budget spend aggregation, import deduplication). Test thoroughly — these are the most likely to surface Drizzle edge cases.
