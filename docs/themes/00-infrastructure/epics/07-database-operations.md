# Epic 07: Database Operations

> Theme: [Infrastructure](../README.md)

## Scope

Establish safe database lifecycle management: unify the migration system, protect production data from accidental destruction, and document the go-live procedure. After this epic, the database can hold real data through any number of schema changes without risk of loss.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 060 | [Database Operations](../prds/060-database-operations/README.md) | Unify migration system on Drizzle, add production guards, pre-migration backups, migration safety tests, go-live runbook | Done |

## Dependencies

- **Requires:** Epic 05 (backup system — pre-migration backup relies on the existing rclone/age pipeline)
- **Unlocks:** Production use with real financial and media data that survives schema changes

## Out of Scope

- Schema design conventions (Foundation Epic 04 / PRD-009)
- Drizzle ORM adoption for query code (Foundation Epic 06 / PRD-011)
- Point-in-time recovery or WAL archival
- Multi-database replication
