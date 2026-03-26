# US-03: Add to library flow

> PRD: [032 — Search Page](README.md)
> Status: To Review

## Description

As a user, I want to add a movie or TV show from search results to my library with a single click so that I can build my collection without leaving the search page.

## Acceptance Criteria

- [ ] Each search result card that is not already in the library shows an "Add to Library" button
- [ ] Clicking "Add" disables the button and shows a spinner to prevent double-clicks
- [ ] For movie results: calls `media.library.addMovie` with the TMDB ID
- [ ] For TV show results: calls `media.library.addTvShow` with the TheTVDB ID
- [ ] On success: button transitions to an "In Library" badge (non-clickable), a toast notification confirms the addition (e.g., "Added [title] to library")
- [ ] On failure: button reverts to "Add to Library" (enabled), an error toast displays the failure reason
- [ ] If the item already exists in the library (race condition or idempotent re-add), the API returns success and the badge renders normally — no duplicate rows created
- [ ] The "In Library" state persists across searches within the same session (the local library cache is updated after a successful add)
- [ ] Multiple items can be added in sequence without waiting for each to complete (non-blocking)
- [ ] Tests cover: button spinner during add, success transitions to badge, failure reverts to button, toast messages, idempotent add (no error on duplicate), cache update after add

## Notes

The add flow triggers a full metadata fetch on the server side (the search result is a preview with limited fields). The client does not need to send metadata — just the external ID. The server fetches everything from the API and stores it. Keep the local tmdbId/tvdbId cache in sync after each successful add so subsequent searches reflect the "In Library" state immediately.
