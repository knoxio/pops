# Idea: Plex PIN-based OAuth UI

Status: not built on the frontend. The backend PIN flow is fully shipped and
tested — `POST /plex/auth/pin` and `POST /plex/auth/pin/check` exist, the SDK
exports `plexGetAuthPin` / `plexCheckAuthPin` / `plexDisconnect`, and tokens are
encrypted at rest. But no app component invokes them. The actual Plex settings
panel (`media.plex` manifest) exposes a plain `plex_token` password field for
**manual token paste** plus a "Test Connection" action — there is no PIN UX.

## What to build

A connect-with-Plex widget in the `media.plex` settings panel that uses the PIN
handshake instead of pasting a raw token:

- "Connect to Plex" button → calls `getAuthPin`, displays the 4-digit code
  prominently with a copy button and a link to `https://plex.tv/link`.
- While waiting, a polling spinner; client polls `checkAuthPin(id)` every ~2s
  until `connected` or `expired`.
- On success: show "Connected as {username}" (from `getPlexUsername`) and a
  "Disconnect" button bound to `media.plex.disconnect`.
- On `expired`: prompt "PIN expired, try again".

Use `strong=false` (4-digit numeric code for manual entry at plex.tv/link) — no
popup/redirect handling needed.

## Acceptance

- The settings panel offers a one-click PIN connect that completes without the
  user touching a raw token.
- The connected username and a disconnect control are visible once authenticated.
- An expired PIN shows a retry prompt rather than hanging.

Also unbuilt from the original spec: the richer dedicated-page UI (ConnectionBadge
wired to live status, SyncResultDisplay with expandable skip/error details,
sync-history list of the last N runs). Today only `WatchlistPlexSyncButton` and
the generic settings panel exist; these are nice-to-have surfaces over the same
already-shipped endpoints (`getLastSyncResults`, `getSyncLogs`, job results).
