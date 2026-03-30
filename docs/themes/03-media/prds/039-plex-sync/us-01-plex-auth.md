# US-01: Plex authentication

> PRD: [039 — Plex Sync](README.md)
> Status: Partial

## Description

As a user, I want to authenticate with my Plex account using a PIN code so that POPS can access my Plex server without me entering my password directly.

## Acceptance Criteria

- [x] `media.plex.getAuthPin()` requests a PIN from the Plex API with `strong=false` (4-digit numeric code for plex.tv/link) and returns `{ id, code, clientId }`
- [x] PIN response includes a unique client identifier that persists across sessions
- [x] `media.plex.checkAuthPin(id)` polls the Plex API to check if the PIN has been claimed
- [x] When the PIN is claimed, the auth token is extracted from the Plex response
- [x] Auth token is stored in the POPS settings table (not in env vars or config files)
- [ ] Token storage is encrypted at rest (or at minimum, not stored as plaintext) — stored as plaintext in settings table
- [ ] After successful auth, the server can identify the Plex username from the token — username not extracted or stored during auth
- [x] `media.plex.disconnect()` deletes the stored token from the settings table
- [x] After disconnect, all Plex API calls that require auth return an "not authenticated" error
- [ ] If the PIN expires before the user authenticates (Plex PINs expire after ~5 minutes), `checkAuthPin` returns an expired status — no expiry check; returns generic error
- [ ] If `checkAuthPin` is called with an invalid or already-claimed PIN ID, an appropriate error is returned — returns generic `INTERNAL_SERVER_ERROR` for all failures
- [ ] Tests cover: PIN generation, successful auth flow, token storage and retrieval, disconnect removes token, expired PIN handling, invalid PIN ID error — partial tests (mock-based, no expiry/invalid PIN coverage)

## Notes

The Plex PIN-based OAuth flow uses three Plex API endpoints: POST to create a PIN, GET to check PIN status, and the resulting auth token for subsequent API calls. The client identifier should be a UUID generated once and stored alongside the token — Plex uses it to identify the POPS application. Poll interval for `checkAuthPin` should be ~2 seconds. The token does not expire but can be revoked by the user from their Plex account settings.

Plex offers two PIN flows: `strong=false` returns a 4-digit numeric code for manual entry at plex.tv/link; `strong=true` returns a long alphanumeric code for OAuth redirect flow. Use `strong=false` — the manual entry UX is simpler and doesn't require popup handling.
