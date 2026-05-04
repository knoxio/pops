# US-02: Production guards on destructive commands

> PRD: [060 — Database Operations](README.md)
> Status: Done

## Description

As an operator, I want destructive database commands to refuse to run against production data so that a mistaken `mise db:seed` can never wipe real financial records.

## Acceptance Criteria

- [x] `scripts/init-db.ts` checks `NODE_ENV` — exits with error message if `NODE_ENV=production`
- [x] `scripts/init-db.ts` checks if the database contains any `transactions` rows — exits with error if count > 0, explaining "Database contains real data. Use migrations to modify the schema."
- [x] `scripts/clear-db.ts` (or equivalent) applies the same two checks
- [x] `scripts/seed-db.ts` (or equivalent) applies the same two checks
- [x] Error messages are specific: tell the user what was detected and what to do instead
- [x] `mise db:init`, `mise db:seed`, `mise db:clear` all inherit these guards (they call the scripts)
- [x] A `--force` flag exists as an escape hatch (e.g., `FORCE=true mise db:init`) for deliberate resets — but prints a warning before proceeding
- [x] Tests cover: guard triggers on production env, guard triggers on non-empty transactions table, `--force` bypasses with warning, guard passes on empty dev database

## Notes

The transaction count check is a heuristic — if someone has imported real bank transactions, the database is "production" regardless of `NODE_ENV`. Both checks run: either one failing blocks the operation.

The `--force` flag exists because sometimes you legitimately need to reset a dev database that has leftover test data in the transactions table. The flag should never be used in CI or automated scripts.
