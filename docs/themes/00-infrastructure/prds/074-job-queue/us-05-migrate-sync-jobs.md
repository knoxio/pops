# US-05: Migrate Sync Jobs

> PRD: [Job Queue Infrastructure](README.md)
> Status: Done

## Description

As a platform operator, I run Plex sync as a BullMQ repeatable job so that sync state survives restarts and job history is queryable via the jobs API.

## Acceptance Criteria

- [x] Plex sync scheduler (`sync-job-manager.ts` + scheduler logic) replaced by BullMQ repeatable jobs
- [x] Sync interval read from `settings` table (existing pattern) and passed as BullMQ `repeat.every`
- [x] Changing sync interval via settings API updates the repeatable job (removes old, creates new)
- [x] Sync job progress reported via BullMQ progress API (replaces in-memory `activeJobs` map)
- [x] Completed sync results written to `sync_job_results` table via BullMQ `completed` event handler
- [x] `sync-job-manager.ts` deleted — all references updated to use BullMQ queue
- [x] Rotation scheduler (if implemented) also migrated to BullMQ repeatable jobs
- [x] Existing sync settings UI continues to work (same API contract, different backend)

## Notes

This is a behaviour-preserving migration — the sync runs at the same intervals with the same logic. The only change is the scheduling and state management mechanism. Test by comparing sync results before and after migration.
