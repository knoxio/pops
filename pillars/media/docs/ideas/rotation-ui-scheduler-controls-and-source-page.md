# Idea: rotation UI — scheduler controls + source-management surface

Forward-looking gaps carved out of the rotation-ui PRD. The data plane and observe routes already exist on the media pillar contract; these are the missing _frontend surfaces_ that consume them.

## Scheduler observability + manual run on the settings page

The rotation settings panel is currently field-only (`media.rotation` manifest). The scheduler routes exist but nothing in the app calls them for display/control:

- **Run Now** button → `POST /rotation/scheduler/run-now`, with a loading/progress indicator while the cycle runs. Disabled when Radarr is disconnected or rotation is off.
- **Live disk space** from `GET /rotation/scheduler/disk-space` (degrades to "unavailable" when Radarr unreachable).
- **Last-run summary** (timestamp, added/removed/marked counts, errors) from `GET /rotation/scheduler/status` / `schedulerLastCycleLog`.
- **Next scheduled run time** (`nextRunAt` from `schedulerStatus`).
- **Radarr-disconnected warning** banner on the panel.
- All controls greyed out except the master toggle when rotation is off (the field manifest does not express conditional-disable today).

This needs a custom settings panel/widget mounted into the shell settings host (the field-based manifest can't render buttons, live queries, or a run-now progress state), or a dedicated `/media/rotation` page instead of the redirect.

## Cron preset picker

Settings currently expose a raw `rotation_cron_expression` text field. Add a preset picker (daily at 3am / 6am / midnight) that writes the cron string, with custom-cron fallback + validation.

## Source-management surface (wire up the orphaned component)

`SourceManagementSection` (+ `SourceCard`, `SourceForm`, `SourceConfigFields`, `useSourceFormModel`) is fully implemented — CRUD via `listSources`/`createSource`/`updateSource`/`deleteSource`, per-source **Sync Now** (`syncSource`), enabled toggle, delete-with-confirmation, numeric priority, type-specific config (plex_watchlist, plex_friends with `listPlexFriends` picker, imdb_top_100, letterboxd list URL, system-managed `manual`), candidate count, last-synced. But it is **not mounted anywhere** — no route, no settings panel — so it is unreachable in the running app.

To ship: add a Sources route under `/media/rotation/sources` (or a settings sub-panel) that renders `SourceManagementSection`, and add a nav entry. The `manual` source must remain non-deletable / non-retypable in the UI (backend already enforces auto-creation).

## Drag-to-reorder source priority

Priority is currently numeric-only (1–10) in `SourceForm`. Add drag-to-reorder in the source list that writes back `priority` values via `updateSource`. (Out of scope in the PRD's current cut.)

## Acceptance (when built)

- [ ] Rotation settings panel shows live disk space, last-run summary, next-run time, and a working Run Now with progress
- [ ] Run Now disabled when Radarr disconnected or rotation off; non-toggle controls greyed when rotation off
- [ ] Cron preset picker writes valid cron strings with a custom fallback
- [ ] A reachable Sources page renders `SourceManagementSection` with full CRUD + Sync Now + Plex-friends picker
- [ ] `manual` source cannot be deleted or retyped from the UI
- [ ] Source priority reorderable by drag, persisting via `updateSource`
