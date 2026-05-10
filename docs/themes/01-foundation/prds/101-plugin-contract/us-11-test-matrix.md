# US-11: Contract test matrix

> PRD: [Plugin Contract](README.md)
> Status: Not started

## Description

As a platform maintainer, I want CI to exercise the full contract under representative install sets so that contract regressions and consumer-side bugs are caught before merge.

## Acceptance Criteria

- [ ] Build-time contract violation tests in `packages/module-registry/scripts/build.test.ts`:
  - [ ] Manifest with missing `id` fails with a message naming `id`.
  - [ ] Manifest with `dependsOn` referencing an absent module fails with both module ids named.
  - [ ] Two manifests claiming the same `uriHandler.types` entry fail with both module ids named.
  - [ ] Two manifests declaring an `aiTools` entry with the same name fail with both module ids named.
  - [ ] Two manifests declaring the same `id` fail.
- [ ] Runtime install-set tests in `apps/pops-api/src/modules/`:
  - [ ] With every module installed: every consumer (settings, features, search, AI tools, URI resolver, migrations) returns the full set.
  - [ ] With `POPS_APPS=finance` only: every consumer returns only finance + core entries; absent modules do not appear in any list.
  - [ ] With `POPS_OVERLAYS=` (empty): no overlay markup is mounted in the shell DOM.
- [ ] E2E test in `apps/pops-shell/e2e/`:
  - [ ] Boot with `POPS_APPS=finance`, navigate to `/media`, expect `NotInstalledPage`.
  - [ ] Boot with all modules, search for a known media title, expect a media result; search again with `POPS_APPS=finance`, expect zero results.
- [ ] CI job runs `pnpm registry:build` and fails if `packages/module-registry/src/generated.ts` differs from the committed file.

## Notes

- Existing PRD-100 install-set tests are folded into this matrix; their assertions migrate to the new consumer interfaces.
- E2E install-set switching uses environment-variable overrides on the test harness — no per-suite docker-compose change required.
