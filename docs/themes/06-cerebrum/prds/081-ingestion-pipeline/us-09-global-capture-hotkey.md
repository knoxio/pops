# US-09: Global Capture Hotkey and Modal

> PRD: [PRD-081: Ingestion Pipeline](README.md)
> Status: Not started

## Description

As a user working anywhere in the pops shell — finance, media, inventory, dashboard — I want a single keyboard shortcut to open a capture modal and land a thought in Cerebrum without losing my place so that capture is genuinely zero-friction across the app.

## Acceptance Criteria

- [ ] Pressing `c` (configurable, see notes) anywhere in the pops shell opens a capture modal centered on screen, regardless of the current route
- [ ] The hotkey does not fire when focus is inside an `input`, `textarea`, `select`, `[contenteditable]`, or any element with `data-capture-hotkey-ignore` set
- [ ] The modal renders the same capture component as the `/cerebrum` route (US-01 capture mode + US-08 bulk paste) so behaviour is identical to the full-page surface
- [ ] On open, focus moves immediately to the body editor; the previously focused element is recorded so focus can be restored on close
- [ ] Esc closes the modal and restores focus to the previously focused element; if the body has unsaved content, Esc shows a confirm-discard step (Esc again to confirm) before closing
- [ ] Cmd/Ctrl+Enter from inside the modal submits via `cerebrum.ingest.quickCapture` and closes the modal on success
- [ ] On successful submit the modal closes and a toast shows the engram id and a "View" action that navigates to the engram detail page; the user remains on the route they were on
- [ ] The modal is dismissible by clicking the backdrop only when the body is empty — non-empty bodies require Esc to prevent accidental loss of work
- [ ] Submission errors keep the modal open with the error inline so the user can retry or copy the body before closing
- [ ] The hotkey is registered exactly once at the shell root, not per-route; duplicate registrations do not stack

## Notes

- The hotkey letter must be configurable per user via a new `cerebrum.captureHotkey` setting. Default `c`. Empty string disables it.
- Focus capture/restore is critical for keyboard-driven users — reuse the existing dialog focus-trap rather than rolling a new one.
- The modal must respect `prefers-reduced-motion` (Cerebrum's design language calls for opacity-only transitions when reduced motion is set).
- The hotkey wiring lives at the shell root so every app benefits without coupling, even though the capture component itself ships in the cerebrum app package — same surface as the `/cerebrum` route, just rendered inside a dialog.
- This US does not depend on US-08 functionally — bulk paste works through the shared component. But shipping US-08 first means the hotkey gets bulk-paste support for free.
