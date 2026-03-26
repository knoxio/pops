# US-03: MarkAsWatchedButton component

> PRD: [033 — Movie Detail Page](README.md)
> Status: To Review

## Description

As a user, I want to mark a movie as watched and have the option to undo so that I can log my viewing history without worrying about accidental clicks.

## Acceptance Criteria

- [ ] MarkAsWatchedButton is a standalone component that accepts a movie ID
- [ ] Clicking the button calls `media.watchHistory.log` with the movie ID, `completed=1`, and the current timestamp
- [ ] Button shows a spinner/loading state while the API call is in flight
- [ ] On success: a toast notification appears with "Marked as watched" and an "Undo" action button
- [ ] The undo toast is visible for 5 seconds before auto-dismissing
- [ ] Clicking "Undo" within the toast window calls `media.watchHistory.delete` to remove the watch event
- [ ] If the movie was on the watchlist before marking as watched, the server-side auto-removal takes effect; undo re-adds it to the watchlist
- [ ] After a successful watch log, the watch history section on the page refreshes to include the new entry
- [ ] The button remains usable after logging a watch (a movie can be watched multiple times — each click logs a new event)
- [ ] Tests cover: API call with correct payload, success toast with undo action, undo deletes the watch event, button re-enabled after logging, watch history refresh after log

## Notes

The watchlist auto-removal is a server-side side effect of `watchHistory.log` — the client does not need to call `watchlist.remove` separately. The undo flow needs to restore the watchlist state if it was removed; this may require the log response to indicate whether a watchlist removal occurred so the undo handler knows to re-add.
