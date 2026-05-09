# US-07: Test matrix

> PRD: [Module Runtime — Tier 1](README.md)
> Status: In progress

## Description

As a maintainer, I want sensible install-set combinations exercised by tests so that future refactors don't regress the runtime gate.

## Acceptance Criteria

- [ ] Backend test covers: default (all installed), `POPS_APPS=finance`, overlay gating.
- [ ] Backend test asserts that `core.shell.manifest` is reachable in every install set.
- [ ] Backend test asserts that absent-module procedure calls return `NOT_FOUND` with a clear message.
- [ ] Frontend test (or e2e snapshot) covers the `RequireModule` guard rendering `NotInstalledPage` for absent modules and `Outlet` for present ones.

## Notes

- The full N×M install-set matrix is not exercised; sensible sets only.
