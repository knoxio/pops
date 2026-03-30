# US-05: Go-live runbook

> PRD: [060 — Database Operations](README.md)
> Status: Done

## Description

As an operator, I want a documented go-live procedure so that I know exactly how to transition from a dev database to real production data and never lose it.

## Acceptance Criteria

- [x] Runbook file created at `docs/runbooks/go-live.md` (accessible from repo when server is down)
- [x] Runbook covers: prerequisites (backups working, migrations unified, guards in place)
- [x] Runbook covers: initial data import — which import commands to run, in what order, with what flags
- [x] Runbook covers: verification — how to confirm data was imported correctly (row counts, spot checks)
- [x] Runbook covers: point of no return — after this step, never run `db:init` or `db:seed` again
- [x] Runbook covers: ongoing operations — how schema changes work going forward (edit schema → generate → review → commit → deploy → auto-migrate on startup)
- [x] Runbook covers: emergency recovery — if something goes wrong, how to restore from backup (references PRD-017 recovery procedure)
- [x] Runbook includes a "safe commands" vs "destructive commands" reference table
- [x] Runbook is linked from the root `CLAUDE.md` under a "Production" section so agents see it

## Notes

The runbook should be concise enough to follow under stress (server down, need to restore). No prose — use numbered steps, command blocks, and verification checks.

Safe commands (always OK): `mise dev`, `mise test`, `mise build`, `mise typecheck`, `mise lint`.
Destructive commands (never in production): `mise db:init`, `mise db:seed`, `mise db:clear`.
Schema change commands (careful): `mise drizzle:generate`, `mise drizzle:migrate`.
