# US-02: Context-aware results panel

> PRD: [056 — Search UI](README.md)
> Status: Not started

## Description

As a user, I want search results grouped by domain with the current app's results first so that the most relevant results are immediately visible.

## Acceptance Criteria

- [ ] Dropdown panel appears below search bar when results exist
- [ ] Results grouped into domain sections (Movies, TV Shows, Transactions, Items, Entities, etc.)
- [ ] Current app's domain section(s) appear first
- [ ] Other domains follow in relevance order
- [ ] Each section shows domain label + result count
- [ ] Empty sections hidden
- [ ] "No results" state when query matches nothing
- [ ] Panel closes on outside click or Escape

## Notes

Context comes from PRD-058. If the user is on `/media/movies/42`, the Movies section leads. If on `/inventory`, Items leads.
