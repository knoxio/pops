# US-04: Credential-gating `requires` pattern

> Parent PRD: [PRD-094 Feature Toggles Framework](README.md)
> GitHub issue: #2302
> Status: In progress

## Goal

When a feature has `requires: [...]` or `requiresEnv: [...]`, the Features admin page must communicate the credential state and prevent the user from enabling a feature whose dependencies are missing.

## Deliverables

- Per-credential chip in the feature card: `Configured` (DB), `Configured via env` (env fallback), or `Missing` with the setting/env-var name.
- The toggle is disabled when any required credential is missing; hover/aria-disabled exposes a hint.
- A "Configure credentials" link points to the relevant Settings section anchor (e.g. `/settings#media.plex`).
- Server-side, `core.features.setEnabled` rejects with `BAD_REQUEST` when credentials are missing — even if the request bypasses the UI.

## Acceptance Criteria

- [x] Each `requires` key renders a chip with one of: `Configured`, `Configured via env`, `Missing`.
- [x] Each `requiresEnv` env var renders a chip with `Configured via env` or `Missing`.
- [x] When at least one chip is `Missing`, the toggle is disabled and the card shows a "Configure credentials first" hint linking to `feature.configureLink`.
- [x] The server rejects `setEnabled({ enabled: true })` for a feature whose credentials are missing.
- [x] Setting a credential value (via the Settings page) and revisiting Features shows the chip as `Configured`.

## Out of Scope

- Inline credential editing in the Features page (requires the Settings page).
- Live cross-tab sync (the Settings page already requires a refresh).
