# US-06: Rotation Log Page

> PRD: [Rotation UI](README.md)

## Description

As a user, I want to see a history of rotation cycles so that I can verify the system is working correctly and review what was added or removed.

## Acceptance Criteria

- [x] Rotation log page shows paginated history of `rotation_log` entries, newest first
- [x] Each entry displays: execution timestamp, movies marked leaving (count), movies removed (count), movies added (count), failed removals (count), disk space at time of run, skip reason (if any)
- [ ] Each entry is expandable to show details: list of movie titles/IDs for each action category (marked, removed, added, failed) — page supports expansion but `rotation_log.details` is always `null` (never written by the scheduler)
- [x] Entries with errors or skip reasons are visually distinguished (warning/error styling)
- [x] Page shows summary stats at top: total movies rotated (all time), average per day, current streak (days since last skip)
- [x] Empty state when no rotation cycles have run yet

## Notes

The `details` JSON column in `rotation_log` contains the per-movie information. Parse and display it in the expanded view. Keep the collapsed view scannable — just the numbers.
