# US-11: Contract test matrix

> PRD: [Plugin Contract](README.md)
> Status: Done

## Description

As a platform maintainer, I want CI to exercise the full contract under representative install sets so that contract regressions and consumer-side bugs are caught before merge.

## Acceptance Criteria

- [x] Build-time contract violations fail the registry build:
  - [x] A manifest with missing `id` fails with a message naming `id`.
  - [x] A manifest with `dependsOn` referencing an absent module fails with both module ids named.
  - [x] Two manifests claiming the same `uriHandler.types` entry fail with both module ids named.
  - [x] Two manifests declaring an `aiTools` entry with the same name fail with both module ids named.
  - [x] Two manifests declaring the same `id` fail.
- [x] Runtime install-set tests parametrised over `[all-modules, finance-only, no-overlays]` cover every cross-cutting consumer:
  - [x] With every module installed: settings, features, search, AI tools, and URI resolver return the full set.
  - [x] With finance-only: every consumer returns only the finance + core entries; absent modules do not appear in any list and `isEnabled` for an absent-module key throws.
  - [x] With no overlays: the overlay subset of the install set is empty.
- [x] An E2E spec covers the install-set boundary surfaces today's shell builds:
  - [x] Direct navigation to an unknown URL renders the 404 page (distinct from `NotInstalledPage`).
  - [x] Direct navigation to an installed module root renders that module.
  - [ ] Full install-set switching (rebuild `MODULES` between Playwright runs, then assert `POPS_APPS=finance` shows `NotInstalledPage` for `/media` and zero media search results) is tracked as a follow-up — install set is baked at registry build time, so two-shell switching needs harness changes.
- [x] CI fails if `packages/module-registry/src/generated.ts` differs from the output of `pnpm registry:build` (the guard shipped with PRD-101 US-02 and is the gate for this story).

## Notes

- Existing PRD-100 install-set tests are folded into this matrix; their assertions migrate to the new consumer interfaces.
- Migration-runner install-set behaviour is exercised in the per-module migration tests landed under US-09.
