# US-03: Admin Features page

> Parent PRD: [PRD-094 Feature Toggles Framework](README.md)
> GitHub issue: #2301
> Status: In progress

## Goal

Build a dedicated `/features` admin page in `pops-shell` (distinct from `/settings`) that lists every registered feature, grouped by module, with its current state and a toggle control where applicable.

## Deliverables

- `apps/pops-shell/src/app/pages/FeaturesPage.tsx` — page component reading from `core.features.list` and `core.features.getManifests`.
- Section per module (`manifest.title`), feature cards inside each section.
- Each card shows: label, description, current state pill (`Enabled` / `Disabled` / `Unavailable`), toggle (when scope is `system` or `user`), credential chip(s) for `requires`.
- Sidebar nav identical to the SettingsPage sidebar (sections sorted by `order`).
- Route `/features` registered in `apps/pops-shell/src/app/router.tsx`.
- Top nav entry under "Settings" cluster — labelled "Features".

## Acceptance Criteria

- [x] `/features` route renders the feature list grouped by module.
- [x] Toggling a feature calls `core.features.setEnabled` and updates the local state on success.
- [x] Capability features show a status pill with no toggle.
- [x] Loading state and empty state are handled gracefully.
- [x] Sidebar nav scrolls to the selected section (mirrors SettingsPage UX).

## Out of Scope

- Credential-gating chips and disabled-toggle behaviour with hint text — that's US-04.
- Per-user toggle UI — that's US-05.
