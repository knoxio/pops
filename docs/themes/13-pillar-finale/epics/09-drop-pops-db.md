# Epic 09: Drop `pops.db`

> Theme: [Pillar finale](../README.md)

## Scope

The finish line. Confirm every table is claimed by a pillar, write the final shared migration that drops the legacy tables, retire the boot-time backfill, remove `apps/pops-api/src/db.ts` exports, unmount the shared volume from any container that no longer needs it.

This is a small but high-stakes epic — once `pops.db` is gone, it's gone. Audit thoroughly first.

## PRDs

| #   | PRD                  | Summary                                                                                           | Status      |
| --- | -------------------- | ------------------------------------------------------------------------------------------------- | ----------- |
| 212 | Readiness audit      | Use schema-coverage CI data + grep to confirm no code still reaches into `pops.db` directly       | Not started |
| 213 | Final drop migration | `0099_drop_legacy_shared_tables.sql` (or per-table series) that drops every now-orphaned table    | Not started |
| 214 | Code retirement      | Remove `apps/pops-api/src/db.ts` exports; retire `backfillXxxFromShared` modules; cleanup imports | Not started |

## Dependencies

- **Requires:** Epic 03 (every table owned by a pillar), Epic 08b (cross-pillar code no longer reaches pops.db)
- **Unlocks:** Nothing further — this is the finish line

## Out of Scope

- Removing pops-api as a service if nothing else needs it (separate concern, requires deciding what cross-pillar code lands where — Epic 08b's call)
- Migrating data from prod `pops.db` to per-pillar dbs — that's already handled by the backfill that ran when N-track cutovers landed; this epic just drops the now-empty tables
- Retiring the shared Litestream replica of `pops.db` — that's a homelab-infra concern (the `pops.db` file may still want a final cold-storage snapshot before retirement)
