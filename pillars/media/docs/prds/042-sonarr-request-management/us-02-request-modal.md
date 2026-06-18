# US-02: Request series modal

> PRD: [042 — Sonarr Request Management](README.md)
> Status: Done

## Description

As a user, I want a modal to request TV series through Sonarr so that I can select quality, language, and root folder preferences while controlling which seasons are monitored.

## Acceptance Criteria

- [x] `RequestSeriesModal` component accepts a series (tvdbId, title, year, seasons[]) and an `onClose` callback
- [x] Modal header shows the series name and year for confirmation
- [x] Quality profile dropdown populated from `media.sonarr.getQualityProfiles()`
- [x] Root folder dropdown populated from `media.sonarr.getRootFolders()`, displaying path and human-readable free space (e.g., "/tv — 800 GB free")
- [x] Language profile dropdown populated from `media.sonarr.getLanguageProfiles()`
- [x] All three dropdowns default to the first available option
- [x] Season monitoring list shows a checkbox for each season with smart defaults: future/current seasons checked, past seasons unchecked
- [x] "Future" is defined as `airDate > today` or `airDate` is null (unannounced); "past" is `airDate` exists and all episodes have aired
- [x] Season checkboxes display season number and air date (e.g., "Season 3 — 2025")
- [x] User can toggle individual season checkboxes to override defaults
- [x] "Select All" / "Deselect All" controls for season list when more than 3 seasons exist
- [x] "Request" confirm button is disabled until quality profile, root folder, and language profile are all selected
- [x] Clicking "Request" calls `media.sonarr.addSeries()` with selected profiles, root folder, and season monitoring array
- [x] Confirm button shows loading spinner while request is in flight
- [x] On success: brief success message, modal closes after 1.5 seconds
- [x] On error: inline error message below confirm button, confirm re-enables
- [x] "Cancel" button and backdrop click close the modal without API calls
- [x] Season list is scrollable when the series has many seasons (e.g., 10+)
- [x] Modal is accessible: focus trap, Escape to close, keyboard-navigable season checkboxes
- [x] Tests verify: all three dropdowns populate from API, season defaults applied correctly (future on, past off), select all/deselect all toggles, confirm sends correct payload including season array, success closes modal, error shows message, cancel closes without API call

## Notes

The season monitoring defaults are the most important UX decision in this modal. A show like The Simpsons has 35+ seasons — defaulting all to monitored would trigger a massive download. Future=on, past=off is the safe default. The "Select All" shortcut lets power users override when they do want a full back catalogue.
