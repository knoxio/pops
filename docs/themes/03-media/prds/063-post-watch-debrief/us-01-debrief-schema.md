# US-01: Debrief schema and auto-queue

> PRD: [063 — Post-Watch Debrief](README.md)
> Status: Done

## Description

As the system, I create debrief rows when a watch event is logged so the user is prompted to debrief that movie.

## Acceptance Criteria

- [x] `debrief_status` table with columns: id, media_type, media_id, dimension_id, debriefed (default 0), dismissed (default 0), created_at
- [x] UNIQUE index on (media_type, media_id, dimension_id)
- [x] When a watch event is logged, insert one debrief row per active dimension for that movie
- [x] If rows already exist (re-watch), reset debriefed and dismissed to 0
- [x] Tests: watch event creates rows, re-watch resets rows, correct number of dimensions
