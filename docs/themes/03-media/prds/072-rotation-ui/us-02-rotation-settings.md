# US-02: Rotation Settings Page

> PRD: [Rotation UI](README.md)

## Description

As a user, I want to configure the rotation system's behaviour so that I can control the pace, timing, and disk space targets for library rotation.

## Acceptance Criteria

- [x] Settings page accessible under Media settings (new section or tab)
- [x] Toggle for `rotation_enabled` with clear on/off state
- [x] Schedule picker: preset options (daily at 3am, 6am, midnight) or custom cron input with validation
- [x] Number inputs for: leaving window (days), daily additions (max movies to add per cycle), target free space (GB), average movie size (GB, for space estimation), protected days
- [x] Input validation per PRD rules: daily additions ≥ 1, leaving window ≥ 1, target free space ≥ 0, avg movie size > 0, protected days ≥ 0
- [x] Displays current Radarr disk space (live query, with "unavailable" state if Radarr is disconnected)
- [x] Displays last rotation run summary: timestamp, movies added/removed/marked, errors
- [x] Displays next scheduled run time
- [x] "Run Now" button to trigger an immediate rotation cycle (disabled if Radarr is disconnected or rotation is disabled)
- [x] All controls disabled (greyed out) except the master toggle when rotation is off

## Notes

Follow the existing Plex settings page pattern for layout. The "Run Now" button should show a loading/progress indicator while the cycle runs.
