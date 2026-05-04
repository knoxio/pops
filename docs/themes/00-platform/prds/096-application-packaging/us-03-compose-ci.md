# US-03: Compose-validate CI job catches syntax regressions before merge

> PRD: [PRD-096 — Application Packaging & GHCR Contract](README.md)
> Status: Done

## Goal

A broken `infra/docker-compose.yml` should fail CI, not surface on the deployer's machine. Add a job to `docker-build.yml` that runs `docker compose config` against both prod and dev compose on any PR that touches them.

## Acceptance Criteria

- [x] `docker-build.yml` has a `compose-validate` job
- [x] Triggered when PR or push touches `infra/docker-compose*.yml` or the workflow itself
- [x] Stubs the 10 secret files referenced by the prod compose so config resolution succeeds without real values
- [x] Runs `docker compose -f infra/docker-compose.yml config --quiet`
- [x] Runs `docker compose -f infra/docker-compose.dev.yml config --quiet`
- [x] Job runs in parallel with the existing `docker-build` job
