# US-02: Plex settings page

> PRD: [039 — Plex Sync](README.md)
> Status: To Review

## Description

As a user, I want a settings page to manage my Plex connection, select library sections to sync, and control sync scheduling so that I can configure how POPS integrates with my Plex server.

## Acceptance Criteria

- [ ] Plex settings page renders at `/media/plex`
- [ ] Connection section: server URL text input with "Test Connection" button
- [ ] "Test Connection" calls `media.plex.testConnection` and displays server name + version on success, or error message on failure
- [ ] Connection status indicator: green check when connected, red X when not
- [ ] Authentication section: "Connect" button initiates PIN flow — displays PIN code and link to `https://plex.tv/link`
- [ ] While waiting for PIN authentication, a polling indicator (spinner) is shown with the PIN code prominently displayed
- [ ] On successful auth, display "Connected as {username}" with a "Disconnect" button
- [ ] "Disconnect" calls `media.plex.disconnect()` and resets the auth section to "Not connected"
- [ ] Library sections: after connecting, display checkboxes for each Plex library section (fetched via `media.plex.getSections`)
- [ ] Sections are labelled with their Plex library name and type (Movie/TV Show)
- [ ] Manual sync button: triggers `syncMovies` and/or `syncTvShows` for selected sections
- [ ] During sync, show progress indicator and disable the sync button
- [ ] After sync completes, display results: synced count, skipped count, error count
- [ ] Error details are expandable if errors > 0
- [ ] Scheduler toggle: on/off switch for automatic periodic sync
- [ ] Interval input: numeric field for hours between syncs (default 6, minimum 1)
- [ ] Scheduler status: "Next sync in X hours" when active, "Scheduler off" when inactive
- [ ] All settings persist across page navigations and server restarts
- [ ] Tests cover: URL input and test connection, PIN auth flow UI, section listing, manual sync with results, scheduler toggle, settings persistence

## Notes

The settings page is a single-page form with distinct sections. Server URL and auth token are stored in the settings table. Library section selection should be stored so the scheduler knows which sections to sync. The PIN auth flow involves client-side polling (`checkAuthPin` every 2 seconds) with a maximum timeout after which the UI prompts the user to try again.
