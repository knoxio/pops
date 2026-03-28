# Epic 04: DB Schema Patterns

> Theme: [Foundation](../README.md)

## Scope

Establish the database conventions that all domains follow: SQLite as source of truth, migration format, shared entity types, cross-domain foreign keys, seed data, and standard column patterns. After this epic, any new domain can add tables that integrate cleanly with the existing schema.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 009 | [DB Schema Patterns](../prds/009-db-schema-patterns/README.md) | Migration conventions, entity type system, cross-domain FKs, seed data, UUID PKs, standard columns | Partial |

## Dependencies

- **Requires:** Epic 03 (API module structure — entity module placement)
- **Unlocks:** All domain schemas

## Out of Scope

- Domain-specific table designs (each theme owns its schema)
- ORM choice (Epic 06)
- Database engine changes
