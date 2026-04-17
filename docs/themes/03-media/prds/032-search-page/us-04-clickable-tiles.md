# US-04: Clickable Tiles and URL Back-State

> PRD: [PRD-032 Search Page](README.md)
> Status: Done

## Story

As a user browsing search results, I want in-library cards to be clickable links so I can navigate directly to the detail page, and I want the browser back button to restore my search query.

## Acceptance Criteria

- [ ] In-library movie cards are rendered as `<Link>` elements navigating to `/media/movies/:id`
- [ ] In-library TV cards are rendered as `<Link>` elements navigating to `/media/tv/:id`
- [ ] Not-in-library cards are not clickable links (plain `div`)
- [ ] The search query is synced to the URL `?q=` param after the 300ms debounce
- [ ] Navigating away and pressing Back restores the query input and results
- [ ] Action buttons inside linked cards call `e.stopPropagation()` and `e.preventDefault()` so they do not trigger card navigation

## Implementation Notes

- `href` prop on `SearchResultCard` is set from the local DB id (`movieTmdbToLocalId` / `tvTvdbToLocalId`)
- The `?q=` param sync uses `useSearchParams` + `setSearchParams({ replace: true })` so it does not add history entries on every keystroke
- `SearchResultCard` wraps the card in `<Link to={href}>` when `href` is set; the action buttons container has an `onClick` that stops propagation
