# US-02: Add entity type system

> PRD: [009 — DB Schema Patterns](README.md)
> Status: Done

**GH Issue:** #420

## Audit Findings

**Present:**
- Migration `20260320120000_core_entity_types.sql` backfills NULL types to `'company'` (SQLite cannot add NOT NULL DEFAULT to existing columns; enforcement is at application layer)
- `ENTITY_TYPES` constant exported from `packages/db-types/src/index.ts` with all five values: `company`, `person`, `place`, `brand`, `organisation`
- Entity service accepts and returns `type`; service defaults to `'company'` when creating
- Zod validation uses `z.enum(ENTITY_TYPES)` in both `CreateEntitySchema` and `UpdateEntitySchema` in `modules/core/entities/types.ts`
- Entity query schema includes `type: z.enum(ENTITY_TYPES).optional()` for filtering
- `entities.test.ts` covers type filtering (`filters by type`) and type update validation
- `initializeSchema()` has `type TEXT NOT NULL DEFAULT 'company'` on the entities table

## Description

As a developer, I want entities to have a `type` column so that they can be distinguished across domains (company, person, place, brand, organisation).

## Acceptance Criteria

- [x] Migration adds `type TEXT NOT NULL DEFAULT 'company'` to entities table
- [x] Entity service and router accept and return `type`
- [x] Type validation enforces supported values (company, person, place, brand, organisation)
- [x] Entity API tests cover type filtering and validation
- [x] `initializeSchema()` updated with the type column

## Notes

Default is `company` — the vast majority of entities are merchants. New types are added by updating the validation list, not by schema changes.
