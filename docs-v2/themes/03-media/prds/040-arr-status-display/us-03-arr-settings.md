# US-03: Arr settings page

> PRD: [040 — Arr Status Display](README.md)
> Status: To Review

## Description

As a user, I want a settings page to configure Radarr and Sonarr connections so that POPS can integrate with my existing media management services.

## Acceptance Criteria

- [ ] Settings page renders at `/media/arr`
- [ ] Radarr section: URL text input, API key password input, "Test Connection" button, status indicator
- [ ] Sonarr section: URL text input, API key password input, "Test Connection" button, status indicator
- [ ] API key inputs are password fields — masked by default with no reveal toggle
- [ ] When settings are loaded, API key fields show placeholder text (e.g., "••••abcd" showing last 4 chars) if a key is already saved, or empty if not set
- [ ] Status indicator: green dot with "Connected" when reachable, red dot with error message when unreachable, grey dot with "Not configured" when URL or API key is missing
- [ ] "Test Connection" button calls `media.arr.testRadarr()` or `media.arr.testSonarr()` — shows loading state during the call
- [ ] On successful test, display the service version (e.g., "Connected — Radarr v5.3.6")
- [ ] On failed test, display the error message from the service (e.g., "Connection refused" or "401 Unauthorized")
- [ ] "Save" button calls `media.arr.saveSettings()` with all non-empty fields — empty API key field means "keep existing key", not "clear the key"
- [ ] Save provides success feedback (toast or inline message)
- [ ] Form validates that URLs start with `http://` or `https://` before allowing save
- [ ] Page loads current settings via `media.arr.getSettings()` on mount
- [ ] Tests verify: settings load on mount, save sends correct payload, empty API key field preserves existing key, test connection shows version on success, test connection shows error on failure, URL validation rejects invalid URLs

## Notes

API keys are sensitive — they must never be returned in full from the API. The password field plus server-side masking ensures keys are write-only from the UI perspective. The "keep existing key" behaviour on empty field prevents accidental key deletion when the user only wants to change the URL.
