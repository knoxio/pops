# Epic: Database Operations

> Theme: [Platform](../README.md)

## Scope

Establish safe per-pillar database lifecycle management: apply each pillar's Drizzle migration journal at boot, resolve the SQLite path safely, protect production data from accidental destruction, and back up each pillar's database independently. After this epic, every pillar's database can hold real data through any number of schema changes without risk of loss.

## PRDs

| PRD                                                          | Summary                                                                                                                | Status |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| [Database Operations](../prds/database-operations/README.md) | Per-pillar SQLite lifecycle: Drizzle migration journal applied at boot, path resolution, independent Litestream backup | Done   |

## Dependencies

- **Requires:** An offsite backup system owned by the deployer (e.g. [knoxio/homelab-infra](https://github.com/knoxio/homelab-infra)) — the local pre-migration safety net complements the offsite schedule
- **Unlocks:** Production use with real financial and media data that survives schema changes

## Out of Scope

- Schema design conventions (Foundation theme — db-schema-patterns)
- Point-in-time recovery or WAL archival
- Multi-database replication
