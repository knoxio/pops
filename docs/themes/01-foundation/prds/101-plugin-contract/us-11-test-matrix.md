# US-11: Contract test matrix

> PRD: [Plugin Contract](README.md)
> Status: Partial — full install-set switching across separate shell builds deferred (see unchecked criterion below).

## Description

As a platform maintainer, I want CI to exercise the full contract under representative install sets so that contract regressions and consumer-side bugs are caught before merge.

## Acceptance Criteria

- [x] Build-time contract violations fail the registry build, and every failure message names the offending module id(s):
  - [x] A manifest missing the id field fails with a message naming the id field.
  - [x] A manifest depending on an absent module fails with both module ids named.
  - [x] Two manifests claiming the same URI handler type fail with both module ids named.
  - [x] Two manifests declaring the same AI tool name fail with both module ids named.
  - [x] Two manifests declaring the same id fail.
- [x] Runtime install-set tests parametrised over representative install sets cover every cross-cutting consumer (settings, features, search, AI tools, URI resolver):
  - [x] With every module installed, every consumer returns the full set.
  - [x] With a single-module install set, every consumer returns only that module's entries; absent modules do not appear in any list and feature lookups for an absent-module key throw.
  - [x] With no overlay modules installed, the overlay subset of the install set is empty.
- [x] An E2E spec covers the install-set boundary surfaces of the shell:
  - [x] Direct navigation to an unknown URL renders the 404 page, distinct from the "module not installed" page.
  - [x] Direct navigation to a known-but-not-installed module id renders the "module not installed" page, distinct from the 404 page.
  - [x] Direct navigation to an installed module's root renders that module.
  - [ ] Full install-set switching across two shell builds (boot one build with a restricted install set, navigate to an excluded module, expect "module not installed"; boot another build with the full install set, search the excluded module, expect results) is tracked as a follow-up — the install set is baked at registry build time, so two-suite switching needs harness changes.
- [x] CI fails when the published module registry source diverges from the output of the registry build (guard shipped with PRD-101 US-02).

## Notes

- Existing PRD-100 install-set tests are folded into this matrix; their assertions migrate to the new consumer interfaces.
- Migration-runner install-set behaviour is exercised in the per-module migration tests landed under US-09.
