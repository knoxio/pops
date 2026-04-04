# US-01: Debrief schema and auto-queue

> PRD: [063 — Post-Watch Debrief](README.md)
> Status: Not started

## Description

As the system, I create debrief rows when a watch event is logged so the user is prompted to debrief that movie.

## Acceptance Criteria

- [ ] `debrief_status` table with columns: id, media_type, media_id, dimension_id, debriefed (default 0), dismissed (default 0), created_at
- [ ] UNIQUE index on (media_type, media_id, dimension_id)
- [ ] When a watch event is logged, insert one debrief row per active dimension for that movie
- [ ] If rows already exist (re-watch), reset debriefed and dismissed to 0
- [ ] Tests: watch event creates rows, re-watch resets rows, correct number of dimensions
