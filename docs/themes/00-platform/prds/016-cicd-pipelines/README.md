# PRD-016: CI/CD Pipelines

> Epic: [00 — CI/CD Pipelines](../../epics/00-cicd-pipelines.md)
> Status: Done

## Overview

GitHub Actions workflows for the pops repo. Quality gates run on every PR and on push to `main`. Image publishing runs on push to `main` (see [PRD-096](../096-application-packaging/README.md)). **No deployment workflow.** Server-side rollout is handled out-of-band by Watchtower (see [PRD-095 in homelab-infra](https://github.com/knoxio/homelab-infra/blob/main/docs/themes/06-pops/prds/095-pops-rollout/README.md)).

## Workflows

| Workflow                 | Trigger                              | Steps                                                               |
| ------------------------ | ------------------------------------ | ------------------------------------------------------------------- |
| `quality.yml`            | PR / push                            | Lint, format check                                                  |
| `api-quality.yml`        | PR / push (API changes)              | Typecheck, test, build                                              |
| `api-test.yml`           | PR / push (API changes)              | Integration test suite                                              |
| `fe-quality.yml`         | PR / push (shell changes)            | Typecheck, test, build                                              |
| `fe-test-e2e.yml`        | PR / push (shell changes)            | Playwright e2e tests                                                |
| `ai-quality.yml`         | PR / push (`packages/app-ai`)        | Typecheck, lint                                                     |
| `finance-quality.yml`    | PR / push (`packages/app-finance`)   | Typecheck, lint                                                     |
| `inventory-quality.yml`  | PR / push (`packages/app-inventory`) | Typecheck, lint                                                     |
| `media-quality.yml`      | PR / push (`packages/app-media`)     | Typecheck, lint                                                     |
| `ui-quality.yml`         | PR / push (`packages/ui`)            | Typecheck, lint                                                     |
| `db-types-quality.yml`   | PR / push (`packages/db-types`)      | Typecheck, lint                                                     |
| `api-client-quality.yml` | PR / push (`packages/api-client`)    | Typecheck, lint                                                     |
| `navigation-quality.yml` | PR / push (`packages/navigation`)    | Typecheck, lint                                                     |
| `tools-quality.yml`      | PR / push (`packages/import-tools`)  | Lint, test                                                          |
| `workflows-quality.yml`  | PR / push (`.github/workflows/**`)   | actionlint                                                          |
| `docker-build.yml`       | PR / push (Dockerfiles, compose)     | `docker build` per Dockerfile + `docker compose config` per compose |
| `publish-images.yml`     | Push to main + tag pushes            | Build + push to `ghcr.io/knoxio/pops-{api,shell}` (see PRD-096)     |

## Business Rules

- Path filters on every workflow — only trigger when relevant files change
- All workflows run on `ubuntu-latest` — pops CI never uses a self-hosted runner
- Quality gates must pass on `main` before image publish (publish job depends on quality jobs only via the same trigger; if a quality workflow fails on `main`, the deployer should pin `POPS_IMAGE_TAG` rather than upgrading)
- No deploy workflow in this repo — Watchtower on the deployer's server pulls new digests automatically

## User Stories

| #   | Story                                       | Summary                                                     | Status |
| --- | ------------------------------------------- | ----------------------------------------------------------- | ------ |
| 01  | [us-01-pr-workflows](us-01-pr-workflows.md) | Per-area CI workflows for PRs (api, shell, packages, tools) | Done   |

## Verification

- PR with API changes triggers `api-quality.yml`
- PR with shell changes triggers `fe-quality.yml`
- PR touching `infra/docker-compose*.yml` triggers `docker-build.yml`'s compose-validate job
- Failing tests block PR merge
- `publish-images.yml` runs on every push to main and uploads images to GHCR

## Out of Scope

- Auto-deployment to a server (Watchtower handles it; spec lives in homelab-infra PRD-095)
- Release versioning (covered by PRD-096 US-05)
- Multiple deployment environments
