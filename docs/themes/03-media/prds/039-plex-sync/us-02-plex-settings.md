# US-02: Plex settings page

> PRD: [039 — Plex Sync](README.md)
> Status: Done

## Description

As a user, I want a settings page to manage my Plex connection, select library sections to sync, and control sync scheduling so that I can configure how POPS integrates with my Plex server.

## Acceptance Criteria

- [x] Plex settings page renders at `/media/plex`
- [x] Connection section: server URL text input with save button and URL validation
- [x] Connection test validates URL reachability; displays error on failure
- [x] Connection status indicator: green/red badge (ConnectionBadge component)
- [x] Authentication section: "Connect to Plex" button initiates PIN flow — displays large PIN code with copy button and link to plex.tv/link
- [x] While waiting for PIN authentication, a polling indicator (spinner) is shown with the PIN code prominently displayed
- [x] On successful auth, shows "Disconnect" button (username available via getPlexUsername query)
- [x] "Disconnect" calls `media.plex.disconnect()` and resets the auth section
- [x] Library sections: dropdown selects for movie and TV libraries (fetched via `media.plex.getLibraries`)
- [x] Sections saved automatically on selection (via `saveSectionIds`)
- [x] Manual sync buttons per media type (Sync Movies / Sync TV Shows)
- [x] During sync, show spinning indicator and disable the sync button
- [x] After sync completes, display results: synced count, skipped count, error count (SyncResultDisplay component)
- [x] Skip reasons and error details are expandable
- [x] Scheduler section: start/stop buttons with configurable interval in hours
- [x] Scheduler status: shows active/inactive, next sync time, last sync time, error info
- [x] Sync history: last 10 sync logs with timestamps, movie/TV counts, duration, errors
- [x] Additional sync sections: Watchlist Sync, Watch History Sync (with diagnostics), Plex Cloud Watch Sync
- [x] All settings persist across page navigations and server restarts
- [x] Tests exist for PlexSettingsPage (PlexSettingsPage.test.tsx)

## Notes

The settings page is a single-page form with distinct sections. Server URL and auth token are stored in the settings table. Library section selection should be stored so the scheduler knows which sections to sync. The PIN auth flow involves client-side polling (`checkAuthPin` every 2 seconds) with a maximum timeout after which the UI prompts the user to try again.
