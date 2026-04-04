# US-03: Skip deploy for docs/CI-only changes

> PRD: [061 — Smart Deploy Pipeline](README.md)
> Status: Done

## Description

As a developer, I want merges that only change documentation or CI workflows to skip deployment entirely so that the deploy pipeline doesn't waste time on non-application changes.

## Acceptance Criteria

- [x] If path detection (us-01) sets `skip_deploy` to true, the deploy job exits early with success
- [x] Deploy job logs: "No application changes — skipping deploy"
- [x] No Docker commands, no Ansible, no git pull on the N95
- [x] The deploy workflow still reports as "success" in GitHub (not skipped) so it doesn't block future required checks
- [x] Applies to changes in: `docs/**`, `.github/workflows/**`, `*.md` at root, `packages/test-utils/**`
- [x] Does NOT skip if any application code also changed in the same merge
