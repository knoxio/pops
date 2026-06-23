# Idea: in-app Radarr/Sonarr credential settings page

Today, Radarr/Sonarr config is ENV-ONLY (`RADARR_URL`, `RADARR_API_KEY`, `SONARR_URL`, `SONARR_API_KEY`). The `/media/arr` route is a redirect to the shell settings hub (`/settings#media.arr`); the media app has no page where a user can type or change credentials. Connection-test endpoints exist server-side (`/arr/radarr/test`, `/arr/sonarr/test`, plus the env-creds `*-saved` variants), but nothing in app-media drives them with editable inputs.

Build a settings surface that lets a user configure both services from the UI instead of redeploying env.

## What to build

- A settings page (in app-media or as a shell settings group) with a Radarr section and a Sonarr section, each with: URL text input, API-key password input (masked, no reveal toggle), a "Test Connection" button, and a status indicator (connected / unreachable / not configured).
- On load, hydrate from `GET /arr/settings`: prefill URLs; show `••••••••` in the key field when a key is set, empty otherwise.
- "Test Connection" calls `POST /arr/radarr/test` / `POST /arr/sonarr/test` with the in-form creds, shows a loading state, then the upstream version/appName on success or the error message on failure. Reuse the existing appName-mismatch detection.
- A "Save" path that persists credentials. This requires a writable store the pillar can own (the current architecture deliberately has none for arr keys) — a `settings`-style table in the media DB, with keys never returned in full and partial updates (saving a URL must not wipe the key, and the `••••••••` placeholder must not overwrite a stored key).
- Per-service independent form state so saving one service does not discard unsaved edits to the other.
- URL normalisation: bare hosts auto-prefixed (`https://`) on save rather than rejected; a failed `http` test suggests retrying over `https`.

## Why it is not built

The pillar must not write its own env at runtime and intentionally has no credential settings table — config resolution is `env` only (see `src/api/clients/arr/config.ts`). Adding a UI write path means introducing and securing a credential store inside the media DB, which is a deliberate, separate decision. Until then, operators set credentials via deployment env and the shell renders read-only health from `/arr/config` + `/arr/settings`.
