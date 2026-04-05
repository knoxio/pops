# US-02b: Result component registry

> PRD: [056 — Search UI](README.md)
> Status: Done

## Description

As a developer, I want a frontend registry that maps domains to their ResultComponents so that the search panel renders domain-specific layouts without knowing about any domain's internals.

## Acceptance Criteria

- [x] `registerResultComponent(domain, component)` adds a React component to the registry
- [x] `getResultComponent(domain)` returns the registered component (or a generic fallback)
- [x] Each app package registers its component at load time (same pattern as route registration)
- [x] Generic fallback renders: title text only (extracted from first string field in `data`)
- [x] Results panel calls `getResultComponent(section.domain)` for each section and renders hits through it
- [x] "Show more" link visible when section's `totalCount > 5`, triggers `showMore` API call and appends results
- [x] Tests: registration works, lookup returns correct component, fallback used for unknown domain, show more appends

## Notes

The registry lives in a shared location accessible to both the shell and app packages — likely `packages/navigation/` or a new `packages/search/` package. Each app package's entry point calls `registerResultComponent` as a side effect.

**Implementation:** `packages/navigation/src/result-component-registry.tsx` — exported from `@pops/navigation`.
