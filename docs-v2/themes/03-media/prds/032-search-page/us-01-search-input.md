# US-01: Debounced search input

> PRD: [032 — Search Page](README.md)
> Status: Partial

## Description

As a user, I want a search input that queries TMDB and TheTVDB as I type so that I can find movies and TV shows without pressing a submit button.

## Acceptance Criteria

- [ ] Search input renders at the top of `/media/search`, full-width, auto-focused on mount — input present but constrained to `max-w-xl` (not full-width); no `autoFocus` prop
- [x] Input is debounced at 300ms — queries fire only after 300ms of no typing
- [x] On debounce trigger, `media.tmdb.searchMovies` and `media.thetvdb.searchShows` are called in parallel with the current query string
- [ ] Previous in-flight requests are cancelled when a new query fires (abort controller or equivalent) — no `AbortController` used
- [ ] Clear button appears inside the input when text is present; clicking it clears the input and all results — not implemented
- [ ] Query string is persisted in the URL as `?q=` — on page load, if `?q=` is present, the search fires immediately — `query` is local state only; no `useSearchParams`
- [x] Empty input (or cleared input) shows placeholder text in result sections: "Search for movies and TV shows"
- [x] No API calls are fired when the query is empty or whitespace-only
- [ ] Tests cover: debounce timing (no call before 300ms, call after 300ms), parallel API calls, request cancellation on rapid input, clear button resets state, URL param persistence, empty query shows placeholder

## Notes

Use `AbortController` to cancel stale requests. The URL `?q=` param enables bookmarkable search results. Each API's loading/error state is managed independently — this story sets up the shared search state that US-02 consumes to render results.
