# US-01: Scope Schema & Validation

> PRD: [Scope Model](README.md)
> Status: Not started

## Description

As a system, I need a scope format specification with parsing and validation utilities so that all scope strings across Cerebrum conform to a consistent hierarchical structure and invalid scopes are rejected at the boundary.

## Acceptance Criteria

- [ ] A Zod schema validates scope strings against the format: lowercase alphanumeric segments separated by dots, 2-6 segments deep, 1-32 characters per segment, hyphens allowed within segments
- [ ] Validation rejects invalid inputs: trailing dots, consecutive dots, uppercase (after normalisation), single-segment scopes, empty strings, segments exceeding 32 characters, scopes exceeding 6 segments
- [ ] A `parseScope` utility splits a scope string into its segment array and returns a typed `Scope` object with `segments`, `depth`, `topLevel`, and `isSecret` properties
- [ ] A `matchesPrefix` utility returns `true` when a scope matches a given prefix — `matchesPrefix("work.projects.karbon", "work")` and `matchesPrefix("work.projects.karbon", "work.projects")` both return `true`
- [ ] The `.secret.` segment is detected reliably — `isSecretScope("personal.secret.therapy")` returns `true`, `isSecretScope("personal.journal")` returns `false`, `isSecretScope("work.secret.jobsearch")` returns `true`
- [ ] A `normaliseScope` utility lowercases and trims the input before validation, so `" Work.Projects.Karbon "` becomes `"work.projects.karbon"`
- [ ] The `scopes` array in engram frontmatter is validated using the scope schema — an engram with an invalid scope is rejected at creation/update time
- [ ] All utilities are exported from a single module (`scope-schema.ts` or equivalent) with full JSDoc documentation

## Notes

This is the foundation for all other scope stories. The Zod schema is reused in tRPC input validation (US-04), the rule engine (US-02), and the filtering service (US-03). Keep the module dependency-free apart from Zod. See [ADR-020](../../../architecture/adr-020-hierarchical-scope-model.md) for the format rationale.
