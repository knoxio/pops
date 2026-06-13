# US-02: Tighten `fe-test-e2e.yml`'s PR trigger to the FE runtime surface

> PRD: [ci-path-filter-audit](README.md)

## Description

As a contributor, I want the Playwright E2E suite to fire only when a PR touches code that can plausibly change rendered UI behaviour, so that DB-only or contract-only PRs don't pay the 10-15 minute E2E cost.

## Acceptance Criteria

- [x] `fe-test-e2e.yml`'s `pull_request: paths:` filter is narrowed to: `apps/pops-shell/**`, `apps/pops-api/**`, `apps/pops-*-api/**`, `packages/app-*/**`, `packages/ui/**`, `packages/api-client/**`, `packages/pillar-sdk/**`, `packages/widgets/**`, `packages/navigation/**`, `packages/types/**`, `packages/*-contract/**`, and `.github/workflows/fe-test-e2e.yml`.
- [x] `packages/*-db/**`, `packages/auth/**`, `packages/test-utils/**`, `packages/module-registry/**`, `packages/food-contracts/**` are removed from the PR trigger.
- [x] The `push:` trigger on `main`/`develop` (currently unfiltered) gains the same allowlist so a docs-only commit landing on main doesn't re-run the suite.
- [x] The job-level `dorny/paths-filter` block's `e2e:` filter is updated to match the new trigger surface.

## Notes

- `packages/*-db/**` changes reach the rendered UI only via api or app-\* code; if a db change doesn't touch a contract or an api, it can't change rendered behaviour (it would compile-fail those packages instead).
- The E2E suite still boots `pops-api`; that's why `apps/pops-api/**` remains in the filter.
- Once PRD-224 lands, this filter will be subsumed by the pillar-tagged scoping.
