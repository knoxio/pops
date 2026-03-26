# Epic 04: CI/CD Pipelines

> Theme: [Infrastructure](../README.md)

## Scope

Set up GitHub Actions workflows for quality gates (typecheck, lint, test, build) and deployment. Deployment is manual-trigger only — never auto-deploy from PRs due to self-hosted runner security.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 016 | [CI/CD Pipelines](../prds/016-cicd-pipelines/README.md) | Workflow definitions for deploy, API CI, shell CI, tests, e2e, Ansible validation, tools CI | Done |

## Dependencies

- **Requires:** Epic 01 (deployment target must exist)
- **Unlocks:** Automated quality gates on every PR, one-command deployment

## Out of Scope

- Auto-deployment from PRs (security risk with self-hosted runner)
- Release versioning or changelogs
- Deployment to multiple environments
