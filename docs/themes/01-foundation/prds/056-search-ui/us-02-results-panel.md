# US-02: Context-aware results panel

> PRD: [056 — Search UI](README.md)
> Status: Not started

## Description

As a user, I want search results grouped by domain with the current app's results first and visually distinct, each rendered by the domain's own component.

## Acceptance Criteria

- [ ] Dropdown panel appears below search bar when results exist
- [ ] Results grouped into domain sections
- [ ] Each section header shows: app icon + domain label + total result count, themed with the domain's color
- [ ] Context section (current app) appears first with a subtle visual distinction (e.g. highlighted background, border accent)
- [ ] Other sections follow, ordered by highest score in section (descending)
- [ ] Each hit rendered by the domain's registered `ResultComponent` — the results panel has no domain-specific rendering logic
- [ ] Frontend maintains a `ResultComponent` registry keyed by domain (populated by each app package)
- [ ] Default limit: 5 results per section. "Show more" link when `totalCount > 5` loads additional results
- [ ] Empty sections hidden
- [ ] "No results" state when query matches nothing across all domains
- [ ] Panel closes on outside click or Escape

## Notes

Context comes from PRD-058. If the user is on `/media/movies/42`, the media section leads. If on `/inventory`, inventory leads.

The `ResultComponent` registry is frontend-only — each app package registers its component at load time (same pattern as route registration). The search panel imports the registry and looks up components by domain name. If no component is registered for a domain, fall back to a generic one-line `title + type` display.
