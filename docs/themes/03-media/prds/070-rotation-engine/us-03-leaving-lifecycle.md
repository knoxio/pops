# US-03: Leaving Lifecycle

> PRD: [Rotation Engine](README.md)

## Description

As a user, I want movies marked as "leaving" to be recoverable by adding them to my watchlist or clicking "Keep," so that the rotation system respects my intent.

## Acceptance Criteria

- [ ] When a movie is added to the watchlist (via `watchlist.add`), if it has `rotation_status = 'leaving'`, the status is cleared to `null` and `rotation_expires_at` / `rotation_marked_at` are set to `null`
- [ ] `rotation.cancelLeaving(movieId)` endpoint clears leaving status for a specific movie
- [ ] Cancelling leaving status returns the movie to the normal eligible pool (no special protection)
- [ ] The watchlist service integration is a side-effect in the existing watchlist add flow — not a separate endpoint
- [ ] Movies with `rotation_status = 'protected'` whose `rotation_expires_at` has passed are automatically cleared to `null` (checked during removal selection, not a separate job)

## Notes

The watchlist router (`watchlist.add`) needs to call into the rotation service to clear leaving status. Keep the coupling minimal — a single function call after successful watchlist insertion.
