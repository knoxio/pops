# US-02: Results panel layout

> PRD: [056 — Search UI](README.md)
> Status: Done

## Description

As a user, I want a dropdown results panel below the search bar that groups results by domain with the current app's section visually distinct.

## Acceptance Criteria

- [x] Dropdown panel appears below search bar when results exist
- [x] Results grouped into domain sections
- [x] Each section header shows: app icon + domain label + total result count, themed with the domain's color
- [x] Context section (current app) appears first with subtle visual distinction (highlighted background or border accent)
- [x] Other sections follow, ordered by highest score in section (descending)
- [x] Empty sections hidden
- [x] "No results" state when query matches nothing across all domains
- [x] Panel closes on outside click or Escape

## Notes

Context comes from PRD-058. If the user is on `/media/movies/42`, the media section leads. If on `/inventory`, inventory leads.
