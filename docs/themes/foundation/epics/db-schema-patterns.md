# Epic: DB Schema Patterns

> Theme: [Foundation](../README.md)

## Scope

Establish the database conventions every pillar follows: each pillar owns its own SQLite database (no shared `pops.db`), migration format, shared entity types, cross-pillar references as URI strings (never foreign keys), seed data, and standard column patterns. After this epic, any new pillar can stand up a schema that participates in the fleet without coordinating a global migration.

## PRDs

| PRD                                                        | Summary                                                                                                          | Status |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------ |
| [DB Schema Patterns](../prds/db-schema-patterns/README.md) | Per-pillar SQLite, migration journals, entity types, cross-pillar URI references, settings table, PK conventions | Done   |

## Dependencies

- **Requires:** [API Server](api-server.md) (REST server pattern — schema lives behind a pillar's contract)
- **Unlocks:** Every pillar schema

## Out of Scope

- Domain-specific table designs (each pillar owns its schema)
- ORM choice ([Drizzle ORM](drizzle-orm.md))
- Database engine changes
