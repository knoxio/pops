# US-06: Fix SQLITE_PATH fallback — replace [REDACTED] placeholder with sane default

> PRD: [060 — Database Operations](README.md)
> Status: Done

## Description

As a developer, I want the API to use a safe fallback database path so that a missing `SQLITE_PATH` env var produces a clear error rather than silently creating a junk database at a literal `[REDACTED]` path.

## Acceptance Criteria

- [x] `db.ts` `getProdDb()` uses `'./data/pops.db'` as the fallback instead of `'[REDACTED]'`
- [x] When `SQLITE_PATH` is not set and `./data/pops.db` does not exist, the server throws a clear error message telling the operator to set `SQLITE_PATH`
- [x] `ai-categorizer-cache.ts` `getCachePath()` uses `'./data/pops.db'` as the fallback instead of `'[REDACTED]'`
- [x] Root `.gitignore` ignores `[REDACTED]*` files in `apps/pops-api/` to prevent junk files from accumulating
- [x] `apps/pops-api/.env.example` documents `SQLITE_PATH` (replacing the stale `DB_PATH` key) with a note that an absolute path is recommended

## Related

GitHub issue: [#2381](https://github.com/knoxio/pops/issues/2381)
