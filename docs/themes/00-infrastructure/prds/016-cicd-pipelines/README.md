# PRD-016: CI/CD Pipelines

> Epic: [04 — CI/CD Pipelines](../../epics/04-cicd-pipelines.md)
> Status: Partial

## Overview

Set up GitHub Actions workflows for quality gates and deployment. Every PR runs typecheck, lint, test, build. Deployment is manual-trigger only — never auto-deploy from PRs (self-hosted runner security risk per ADR-015).

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

- Deployment runs on push to main and via manual `workflow_dispatch` — see issue #1818 for tracking the gap between this and the originally-specified manual-only trigger
- Self-hosted runner runs on the production server — used only for the deploy step
- All quality gates (typecheck, lint, test, build) must pass before deploy step runs
- Path filters on CI workflows — only trigger when relevant files change
- PR-based workflows run on GitHub-hosted runners (safe), deployment runs on self-hosted runner

## User Stories

| #   | Story                                             | Summary                                                         | Status  | Parallelisable   |
| --- | ------------------------------------------------- | --------------------------------------------------------------- | ------- | ---------------- |
| 01  | [us-01-pr-workflows](us-01-pr-workflows.md)       | CI workflows for PRs: API, shell, test, e2e, ansible, tools     | Done    | No (first)       |
| 02  | [us-02-deploy-workflow](us-02-deploy-workflow.md) | Manual deploy workflow with quality gates and server deployment | Partial | Blocked by us-01 |

## Verification

- PR with API changes triggers `pops-api-ci.yml`
- PR with shell changes triggers `shell-ci.yml`
- Failing tests block PR merge
- `deploy.yml` only available via manual trigger — not on PR events
- Deploy runs quality gates before deployment step
- Deploy reaches the server and restarts services

## Out of Scope

- Auto-deployment from PRs
- Release versioning or changelogs
- Multiple deployment environments

## Drift Check

last checked: 2026-04-17
