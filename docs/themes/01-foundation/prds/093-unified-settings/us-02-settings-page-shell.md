# US-02: Settings Page Shell

> PRD: [PRD-093: Unified Settings System](README.md)

## Description

As a user, I want a unified settings page at `/settings` with a navigable sidebar so that I can find and manage all system settings in one place without knowing which app package owns each setting.

## Acceptance Criteria

### Routing & Navigation

- [x] `/settings` route is added to the shell router (`apps/pops-shell/src/app/router.tsx`)
- [x] A "Settings" entry is added to the bottom of the main navigation with a gear icon
- [x] The settings page is not nested under any app route — it is a top-level shell route

### Layout

- [x] The page has a two-column layout: a left sidebar for section navigation and a right content area for scrollable settings sections
- [x] The sidebar displays one entry per registered manifest, showing the manifest's icon (Lucide icon name) and title
- [x] Sidebar entries are sorted by manifest `order` (ascending), matching the content area order
- [x] Each section in the content area has an anchor element with an `id` matching the manifest ID (e.g., `id="media.plex"`)

### Deep Linking & Scroll Behavior

- [x] Navigating to `/settings#media.plex` scrolls the content area to the section with `id="media.plex"`
- [x] The sidebar highlights the section that is currently visible in the viewport as the user scrolls (using an intersection observer)
- [x] Clicking a sidebar entry scrolls to the corresponding section and updates the URL hash

### States

- [x] A loading skeleton is displayed while the `core.settings.getManifests` query is in flight
- [x] An empty state is shown if `getManifests` returns zero manifests (e.g., "No settings registered")

### Responsive

- [x] On mobile viewports, the sidebar collapses to a dropdown selector at the top of the page
- [x] Selecting an entry from the mobile dropdown scrolls to that section

### Data

- [x] The page fetches manifests exclusively from `core.settings.getManifests` — it has zero hardcoded knowledge of which apps or sections exist
- [x] Sections are rendered dynamically from the manifest data; adding a new manifest causes its section to appear without modifying the settings page code

## Notes

- This story builds the page skeleton and section navigation only. The actual field rendering is handled by US-03 (Section Renderer). For initial development, each section can render a placeholder with the manifest title and group titles.
- The intersection observer should use a reasonable threshold (e.g., the section whose top is closest to the viewport top) to determine the active sidebar entry.
- This story can be developed in parallel with US-01 — use the `SettingsManifest` type from `@pops/types` and mock the `getManifests` response during development.
