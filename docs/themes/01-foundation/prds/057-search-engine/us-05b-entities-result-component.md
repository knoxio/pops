# US-05b: Entities result component (frontend)

> PRD: [057 — Search Engine](README.md)
> Status: Done

## Description

As a user, I want entity search results to show name and type badge so I can identify merchants, employers, etc.

## Acceptance Criteria

- [x] `EntitiesResultComponent` registered in frontend registry for domain `"entities"`
- [x] Renders: entity name + type badge (company, person, government, etc.)
- [x] Aliases shown as secondary text if available
- [x] Highlights matched portion of name using `query` prop + `matchField`/`matchType`
- [x] Tests: renders correctly with type badge, aliases, highlighting

## Notes

Component lives in `packages/app-finance/`. Depends on US-05 for hit data shape.
