# US-01: PR quality gate workflows

> PRD: [016 — CI/CD Pipelines](README.md)
> Status: Done

## Description

As a developer, I want CI workflows that run on every PR so that broken code can't be merged.

## Acceptance Criteria

- [x] `pops-api-ci.yml` runs lint, test, build on API changes
- [x] `shell-ci.yml` runs lint, build on shell changes
- [x] `test.yml` runs full test suite
- [x] `e2e.yml` runs Playwright tests
- [x] `ansible-ci.yml` runs syntax check on ansible changes
- [x] `tools-ci.yml` runs lint, test on import tools changes
- [x] Path filters configured — workflows only trigger on relevant file changes
- [x] All workflows run on GitHub-hosted runners (not self-hosted)
- [x] Failing workflow blocks PR merge

## Notes

Path filters prevent unnecessary CI runs. API changes don't trigger shell CI, and vice versa.
