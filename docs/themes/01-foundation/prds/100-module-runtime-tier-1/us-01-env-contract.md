# US-01: Env contract

> PRD: [Module Runtime — Tier 1](README.md)
> Status: In progress

## Description

As an operator, I want `POPS_APPS` and `POPS_OVERLAYS` to control which modules my deployment installs so that I can run "just finance" without a custom build.

## Acceptance Criteria

- [ ] `POPS_APPS` accepts a comma-separated list of app ids; valid: `finance`, `media`, `inventory`, `ai`, `cerebrum`.
- [ ] `POPS_OVERLAYS` accepts a comma-separated list of overlay ids; valid: `ego`.
- [ ] Empty/unset means "install all known modules" (preserves existing deployments).
- [ ] An unknown module id in either var causes the API server to fail at startup with a message naming the bad value and the valid set.
- [ ] Whitespace and duplicates are tolerated; ordering is preserved.
- [ ] Documented in `apps/pops-api/.env.example` and `infra/docker-compose.yml`.

## Notes

- Reads via `getEnv()` so Docker secrets and `process.env` both work (production vs dev).
- Helper lives in `apps/pops-api/src/modules/env-modules.ts` with `readInstalledModules()` returning `{ apps, overlays }`.
