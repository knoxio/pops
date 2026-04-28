# US-04: Scheduled Triggers

> PRD: [PRD-089: Reflex System](README.md)
> Status: Done

## Description

As a user, I want cron-based reflexes that run on a schedule so that routine operations like weekly summaries, daily staleness scans, and monthly consolidation passes happen automatically without event triggers.

## Acceptance Criteria

- [x] Scheduled triggers use BullMQ repeatable jobs with the cron expression from the reflex's `trigger.cron` field — jobs are registered on system startup and re-registered when `reflexes.toml` is reloaded
- [x] Standard 5-field cron expressions are supported: minute (0-59), hour (0-23), day-of-month (1-31), month (1-12), day-of-week (0-6, Sunday=0). No second-level granularity
- [x] When a scheduled trigger fires, the reflex's action is dispatched immediately — the action runs as a new BullMQ job on the appropriate queue (`pops:glia` for Glia actions, `pops:emit` for Emit actions, `pops:ingest` for Ingest actions)
- [x] If a previous execution of the same reflex is still running when the next schedule fires, the new execution is skipped with a warning log — no concurrent executions of the same scheduled reflex
- [x] Each reflex execution creates a `reflex_executions` row with `trigger_type: 'schedule'`, the cron expression and scheduled fire time in `trigger_data`, and the action outcome in `result`
- [x] Disabling a scheduled reflex removes its BullMQ repeatable job — re-enabling re-registers it. The next fire time is calculated from the current time, not from the last fire time
- [x] Scheduled triggers respect the system timezone configured in pops settings — cron expressions are evaluated in the user's local timezone, not UTC
- [x] On startup, all enabled scheduled reflexes are registered as repeatable jobs. Existing stale repeatable jobs (from previously removed reflexes) are cleaned up

## Notes

- BullMQ's built-in repeatable job support handles cron scheduling natively — use `queue.add(name, data, { repeat: { cron, tz } })`.
- The "no concurrent execution" rule prevents cascading delays — if a weekly summary takes longer than expected, it should not queue up multiple runs.
- Timezone handling is important for user-facing schedules — "every Sunday at 8am" should mean the user's 8am, not UTC 8am. Read timezone from pops system config.
- Consider providing a `nextFireTime` field in the reflex listing API so the user can see when each scheduled reflex will next run.
