# Epic 04: CI/CD Pipelines

> Theme: [Infrastructure](../README.md)

## Scope

GitHub Actions workflows for quality gates (typecheck, lint, test, build) and automated deployment. Merges to main auto-deploy to the N95 via a self-hosted runner. Smart deploy detects what changed and only rebuilds/restarts affected services.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 016 | [CI/CD Pipelines](../prds/016-cicd-pipelines/README.md) | Workflow definitions for deploy, API CI, shell CI, tests, e2e, Ansible validation, tools CI | Done |
| 061 | [Smart Deploy Pipeline](../prds/061-smart-deploy/README.md) | Path-based selective deploy — only rebuild changed services, skip deploy for docs-only changes, health checks, Ansible runner provisioning | Done |

## Dependencies

- **Requires:** Epic 01 (deployment target must exist)
- **Unlocks:** Automated quality gates on every PR, auto-deploy on merge to main

## Out of Scope

- Release versioning or changelogs
- Deployment to multiple environments
- Blue/green or canary deployments
