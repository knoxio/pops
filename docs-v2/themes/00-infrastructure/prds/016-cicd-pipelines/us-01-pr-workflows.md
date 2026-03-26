# US-01: PR quality gate workflows

> PRD: [016 — CI/CD Pipelines](README.md)
> Status: To Review

## Description

As a developer, I want CI workflows that run on every PR so that broken code can't be merged.

## Acceptance Criteria

- [ ] `pops-api-ci.yml` runs lint, test, build on API changes
- [ ] `shell-ci.yml` runs lint, build on shell changes
- [ ] `test.yml` runs full test suite
- [ ] `e2e.yml` runs Playwright tests
- [ ] `ansible-ci.yml` runs syntax check on ansible changes
- [ ] `tools-ci.yml` runs lint, test on import tools changes
- [ ] Path filters configured — workflows only trigger on relevant file changes
- [ ] All workflows run on GitHub-hosted runners (not self-hosted)
- [ ] Failing workflow blocks PR merge

## Notes

Path filters prevent unnecessary CI runs. API changes don't trigger shell CI, and vice versa.
