# US-02b: Result component registry

> PRD: [056 — Search UI](README.md)
> Status: Not started

## Description

As a developer, I want a frontend registry that maps domains to their ResultComponents so that the search panel renders domain-specific layouts without knowing about any domain's internals.

## Acceptance Criteria

- [ ] `registerResultComponent(domain, component)` adds a React component to the registry
- [ ] `getResultComponent(domain)` returns the registered component (or a generic fallback)
- [ ] Each app package registers its component at load time (same pattern as route registration)
- [ ] Generic fallback renders: title text only (extracted from first string field in `data`)
- [ ] Results panel calls `getResultComponent(section.domain)` for each section and renders hits through it
- [ ] "Show more" link visible when section's `totalCount > 5`, triggers `showMore` API call and appends results
- [ ] Tests: registration works, lookup returns correct component, fallback used for unknown domain, show more appends

## Notes

The registry lives in a shared location accessible to both the shell and app packages — likely `packages/navigation/` or a new `packages/search/` package. Each app package's entry point calls `registerResultComponent` as a side effect.
