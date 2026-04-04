# US-02: Request movie modal

> PRD: [041 — Radarr Request Management](README.md)
> Status: Done

## Description

As a user, I want a modal to request movies through Radarr so that I can select a quality profile and root folder before adding a movie to my download queue.

## Acceptance Criteria

- [x] `RequestMovieModal` component accepts a movie (tmdbId, title, year) and an `onClose` callback
- [x] Modal header shows the movie title and year for confirmation
- [x] Quality profile dropdown is populated by calling `media.radarr.getQualityProfiles()` when the modal opens
- [x] Root folder dropdown is populated by calling `media.radarr.getRootFolders()` when the modal opens
- [x] Root folder options display the path and human-readable free space (e.g., "/movies — 1.2 TB free")
- [x] Both dropdowns default to the first available option
- [x] "Request" confirm button is disabled until both quality profile and root folder are selected
- [x] "Request" confirm button is disabled while data is loading (profiles/folders fetch in progress)
- [x] Clicking "Request" calls `media.radarr.addMovie()` with the selected options
- [x] Confirm button shows a loading spinner while the request is in flight
- [x] On success: modal shows a brief success message, then closes after 1.5 seconds
- [x] On error: modal shows an inline error message below the confirm button (e.g., "Movie already exists in Radarr"), confirm button re-enables
- [x] "Cancel" button closes the modal without making any API calls
- [x] Clicking the modal backdrop closes the modal (same as cancel)
- [x] If quality profiles or root folders fail to load, the modal shows an error state with a retry option
- [x] Modal is accessible: focus trapped within modal, Escape key closes it, confirm button is focusable
- [x] Tests verify: dropdowns populate from API data, confirm sends correct payload, success flow closes modal, error flow shows message, cancel closes without API call, loading states disable interactions, empty profiles/folders show error

## Notes

Quality profiles and root folders are fetched fresh each time the modal opens — do not cache these. The modal should feel lightweight and fast despite the two API calls on open. Consider fetching both in parallel to minimise wait time.
