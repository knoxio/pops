# US-02: Define Drizzle schema files

> PRD: [011 — Drizzle ORM](README.md)
> Status: Done

## Description

As a developer, I want all existing tables defined as Drizzle schema files so that table definitions are the single source of truth for both DDL and TypeScript types.

## Acceptance Criteria

- [x] Schema files exist for all tables: entities, transactions, budgets, wish_list, home_inventory, locations, item_connections, item_photos, item_documents, movies, tv_shows, seasons, episodes, watchlist, watch_history, comparisons, comparison_dimensions, media_scores, ai_usage, transaction_corrections, environments, settings, schema_migrations
- [x] All columns, types, constraints, defaults, and foreign keys match the existing database schema
- [x] `schema/index.ts` re-exports all table definitions
- [x] `InferSelectModel` and `InferInsertModel` produce correct types for each table
- [x] `drizzle-kit generate` produces an empty migration (schema matches existing DB)

## Notes

This is a definition exercise — no queries change yet. The schema files must exactly match the existing database. Run `drizzle-kit generate` to verify alignment — it should produce nothing (no diff).
