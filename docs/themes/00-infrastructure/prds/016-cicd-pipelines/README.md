# PRD-016: CI/CD Pipelines

> Epic: [04 — CI/CD Pipelines](../../epics/04-cicd-pipelines.md)
> Status: Done

## Overview

Set up GitHub Actions workflows for quality gates and deployment. Every PR runs typecheck, lint, test, build. Deployment is manual-trigger only — never auto-deploy from PRs (self-hosted runner security risk per ADR-015).

## Workflows

| Workflow | Trigger | Steps |
|----------|---------|-------|
| `pops-api-ci.yml` | PR / push (API changes) | Lint, test, build |
| `shell-ci.yml` | PR / push (shell changes) | Lint, build |
| `test.yml` | PR / push | Full test suite |
| `e2e.yml` | PR / push | Playwright e2e tests |
| `ansible-ci.yml` | PR / push (ansible changes) | Syntax validation |
| `tools-ci.yml` | PR / push (import tools changes) | Lint, test |
| `deploy.yml` | Manual (workflow_dispatch) | Typecheck, lint, test, build, deploy to server |

## Business Rules

- Deployment is manual-trigger only (`workflow_dispatch`) — never on PR merge or push
- Self-hosted runner runs on the production server — manual trigger prevents fork-based attacks
- All quality gates (typecheck, lint, test, build) must pass before deploy step runs
- Path filters on CI workflows — only trigger when relevant files change
- PR-based workflows run on GitHub-hosted runners (safe), deployment runs on self-hosted runner

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-pr-workflows](us-01-pr-workflows.md) | CI workflows for PRs: API, shell, test, e2e, ansible, tools | Done | No (first) |
| 02 | [us-02-deploy-workflow](us-02-deploy-workflow.md) | Manual deploy workflow with quality gates and server deployment | Done | Blocked by us-01 |

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
