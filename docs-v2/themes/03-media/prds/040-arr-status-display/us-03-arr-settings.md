# US-03: Arr settings page

> PRD: [040 — Arr Status Display](README.md)
> Status: Partial

## Description

As a user, I want a settings page to configure Radarr and Sonarr connections so that POPS can integrate with my existing media management services.

## Acceptance Criteria

- [x] Settings page renders at `/media/arr`
- [x] Radarr section: URL text input, API key password input, "Test Connection" button, status indicator
- [x] Sonarr section: URL text input, API key password input, "Test Connection" button, status indicator
- [ ] API key inputs are password fields — masked by default with no reveal toggle — implementation HAS a reveal toggle (show/hide key button)
- [x] When settings are loaded, API key fields show `••••••••` if a key is already saved, or empty if not set
- [x] Status indicator: connected/unreachable/not configured states
- [x] "Test Connection" button calls testRadarr/testSonarr, shows loading state
- [x] On successful test, displays service version
- [x] On failed test, displays error message
- [x] "Save" button calls saveSettings — masked placeholder (`••••••••`) preserved, not overwritten
- [x] Save provides success feedback
- [ ] Form validates that URLs start with `http://` or `https://` before allowing save — no URL validation implemented (only placeholder text)
- [x] Page loads current settings via `getSettings()` on mount
- [x] Tests verify: load on mount, save payload, key preservation, test connection success/failure

## Notes

API keys are sensitive — they must never be returned in full from the API. The password field plus server-side masking ensures keys are write-only from the UI perspective. The "keep existing key" behaviour on empty field prevents accidental key deletion when the user only wants to change the URL.
