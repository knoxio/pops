# US-02: Rule definitions

> PRD: [Module Import Boundaries](README.md)
> Status: In progress

## Description

As a contributor, I want cross-module import rules codified in `.dependency-cruiser.cjs` so that the boundary set is one config file, not tribal knowledge.

## Acceptance Criteria

- [ ] A `no-cross-app-import` rule forbids `packages/app-<x>/**` from importing `@pops/app-<y>` where x ≠ y.
- [ ] A `no-cross-api-module-import` rule forbids `apps/pops-api/src/modules/<x>/**` from importing `apps/pops-api/src/modules/<y>/**` where x ≠ y and y ≠ `core`.
- [ ] The allow-list of shared workspace packages (`@pops/ui`, `@pops/api-client`, `@pops/navigation`, `@pops/db-types`, `@pops/types`, `@pops/import-tools`, `@pops/auth`) is encoded in the rule comment for discoverability — not as a separate forbidding rule.
- [ ] Type-only imports (`import type ...`) are subject to the same rule.
- [ ] Test files (`__tests__/`, `*.test.ts`) are not exempt.

## Notes

- `core` is the only api module that everyone may import from; encode this as an allow on the `no-cross-api-module-import` rule, not a separate rule.
- The rule names appear in CI failure output; pick names that read well in error messages.
- Generated code under `apps/pops-api/src/modules/*/migrations/` and `drizzle.config.ts` is out of scope; ensure the cruise config excludes them.
