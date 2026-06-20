# US-03: Delete watch event

> PRD: [035 — Watch History](README.md)
> Status: Done

## Description

As a user, I want to delete a watch event from my history so that I can correct mistakes (e.g., accidentally marked something as watched).

## Acceptance Criteria

- [x] Each history entry has a delete action — icon button visible on hover (desktop) or via swipe gesture (mobile)
- [x] Clicking delete shows a confirmation dialog: "Remove this watch event? This cannot be undone."
- [x] Confirming calls `media.watchHistory.delete` with the watch event ID
- [x] On success, the entry is removed from the list without a full page reload (optimistic or refetch)
- [x] On error, a toast displays "Failed to delete watch event" and the entry remains
- [x] Delete action is disabled while the request is in flight (prevent double-clicks)
- [x] Deleting the only entry on a page triggers pagination adjustment (go to previous page or show empty state)
- [x] Tests cover: delete button visibility on hover, confirmation dialog flow, successful removal, error handling, pagination edge case

## Notes

Delete is permanent and intended for corrections, not as a general "undo watched" flow. The undo toast for mark-as-watched lives on the detail pages (PRD-033, PRD-034), not here. The confirmation dialog prevents accidental deletions since the action is irreversible.
