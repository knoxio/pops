# US-05: Settings link from overlay header

> PRD: [Overlay Surfaces](README.md)
> Status: In progress

## Description

As a user, I want to jump to ego settings from the overlay header so that I can adjust scopes/personas/etc. without leaving the chat context.

## Acceptance Criteria

- [ ] The overlay header includes a button linking to `/settings/ego` (existing route from PRD-093).
- [ ] The link uses `react-router`'s `Link` so navigation stays in-SPA.
- [ ] The button is a 44×44px+ touch target with `aria-label="Open Ego settings"`.

## Notes

- The settings page itself already exists from PRD-093 unified settings. This US is wiring only.
