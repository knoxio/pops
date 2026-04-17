# PRD-016: CI/CD Pipelines

> Epic: [04 — CI/CD Pipelines](../../epics/04-cicd-pipelines.md)
> Status: Done

## Overview

Set up GitHub Actions workflows for quality gates and deployment. Every PR runs typecheck, lint, test, build. Deployment triggers automatically on push to main (CD) and is also available via `workflow_dispatch`. PR-triggered workflows run on GitHub-hosted runners; the deploy step uses the self-hosted runner on the production server.

## Workflows

| Workflow            | Trigger                          | Steps                                          |
| ------------------- | -------------------------------- | ---------------------------------------------- |
| `api-quality.yml`   | PR / push (API changes)          | Typecheck, test, build                         |
| `fe-quality.yml`    | PR / push (shell changes)        | Typecheck, test, build                         |
| `quality.yml`       | PR / push                        | Lint, format check                             |
| `fe-test-e2e.yml`   | PR / push                        | Playwright e2e tests                           |
| `infra-quality.yml` | PR / push (ansible changes)      | YAML lint, ansible-lint, syntax check          |
| `tools-quality.yml` | PR / push (import tools changes) | Lint, test                                     |
| `root-deploy.yml`   | Push to main + workflow_dispatch | Typecheck, lint, test, build, deploy to server |

## Business Rules

- Deployment triggers on push to main (CD) and via `workflow_dispatch`
- Self-hosted runner runs on the production server — used only for the deploy step
- All quality gates (typecheck, lint, test, build) must pass before deploy step runs
- Path filters on CI workflows — only trigger when relevant files change
- PR-based workflows run on GitHub-hosted runners; deploy step runs on self-hosted runner

## User Stories

| #   | Story                                             | Summary                                                     | Status | Parallelisable   |
| --- | ------------------------------------------------- | ----------------------------------------------------------- | ------ | ---------------- |
| 01  | [us-01-pr-workflows](us-01-pr-workflows.md)       | CI workflows for PRs: API, shell, test, e2e, ansible, tools | Done   | No (first)       |
| 02  | [us-02-deploy-workflow](us-02-deploy-workflow.md) | Deploy workflow — push-to-main CD with quality gates        | Done   | Blocked by us-01 |

## Verification

- PR with API changes triggers `api-quality.yml`
- PR with shell changes triggers `fe-quality.yml`
- Failing tests block PR merge
- `root-deploy.yml` triggers on push to main and via `workflow_dispatch`
- Deploy runs quality gates before deployment step
- Deploy reaches the server and restarts services

## Out of Scope

- Auto-deployment from PRs
- Release versioning or changelogs
- Multiple deployment environments

## Drift Check

last checked: 2026-04-18
