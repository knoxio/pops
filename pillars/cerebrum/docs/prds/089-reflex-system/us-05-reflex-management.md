# US-05: Reflex Management

> PRD: [PRD-089: Reflex System](README.md)
> Status: Done

## Description

As a user, I want to enable, disable, test, and view execution history for my reflexes so that I can control and debug automation behaviour without editing TOML files directly.

## Acceptance Criteria

- [x] `cerebrum.reflexes.enable` sets the `enabled` field to `true` in `reflexes.toml` for the specified reflex name, writes the updated file, and triggers a reload — the reflex's triggers are activated immediately
- [x] `cerebrum.reflexes.disable` sets the `enabled` field to `false` in `reflexes.toml` for the specified reflex name, writes the updated file, and triggers a reload — the reflex's triggers are deactivated (scheduled jobs removed, event subscriptions cleared)
- [x] `cerebrum.reflexes.test` performs a dry-run execution of the specified reflex: event triggers fire with a synthetic event payload, threshold triggers evaluate current metrics without acting, scheduled triggers fire immediately. The action runs in dry-run mode (Glia `dryRun: true`, Emit preview, Ingest preview) — no side effects
- [x] The test result is returned directly and also logged as a `reflex_executions` row with `status: 'completed'` and a `dry_run: true` flag in the `result` JSON
- [x] `cerebrum.reflexes.list` returns all reflexes from `reflexes.toml` with runtime state: enabled status, trigger type, last execution timestamp, next fire time (for scheduled triggers), total execution count
- [x] `cerebrum.reflexes.history` returns paginated execution history from the `reflex_executions` table, filterable by reflex name, trigger type, status, and date range
- [x] Enabling or disabling a non-existent reflex returns a `NOT_FOUND` error with the reflex name
- [x] TOML file writes preserve formatting, comments, and ordering — only the `enabled` field is modified

## Notes

- TOML file writes that preserve formatting require a TOML library with round-trip support (e.g., `@iarna/toml` supports this). Naive parse-modify-serialize would strip comments.
- The dry-run test is the primary debugging tool for reflexes — users should be able to test what a reflex would do before enabling it.
- Execution history retention should have a configurable limit (default: 1000 rows per reflex) to prevent unbounded table growth. Older executions are pruned on each write.
- Consider a shell UI component for reflex management in a future PRD — for now, the API is the interface, callable from the CLI or shell developer tools.
