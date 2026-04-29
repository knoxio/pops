# US-02: Migrate existing ad-hoc toggles to FeatureManifest

> Parent PRD: [PRD-094 Feature Toggles Framework](README.md)
> GitHub issue: #2300
> Status: In progress

## Goal

Move every existing ad-hoc toggle behind the FeatureManifest pattern so all modules read state through the same `features.isEnabled()` helper. Behaviour is preserved — this is a centralisation of reads, not a behaviour change.

## Toggles to Migrate

| Existing check                                                   | Feature key             | Scope      | Required credentials                             |
| ---------------------------------------------------------------- | ----------------------- | ---------- | ------------------------------------------------ |
| `plex_scheduler_enabled` setting                                 | `media.plex.scheduler`  | system     | `plex_url`, `plex_token`                         |
| `rotation_enabled` setting                                       | `media.rotation`        | system     | (none)                                           |
| `getEnv('PAPERLESS_BASE_URL')` + `getEnv('PAPERLESS_API_TOKEN')` | `inventory.paperless`   | system     | env: `PAPERLESS_BASE_URL`, `PAPERLESS_API_TOKEN` |
| Radarr URL + API key probe                                       | `media.radarr`          | system     | `radarr_url`, `radarr_api_key`                   |
| Sonarr URL + API key probe                                       | `media.sonarr`          | system     | `sonarr_url`, `sonarr_api_key`                   |
| Redis client status                                              | `core.redis`            | capability | env: `REDIS_HOST`                                |
| `isVecAvailable()`                                               | `cerebrum.vectorSearch` | capability | (capability probe)                               |

## Acceptance Criteria

- [x] Each module declares its FeatureManifest and registers it on startup (same lifecycle as SettingsManifest registration).
- [x] `media.plex.scheduler` reads/writes `plex_scheduler_enabled` (preserves existing setting key).
- [x] `media.rotation` reads/writes `rotation_enabled`.
- [x] `getPaperlessClient()` uses `features.isEnabled('inventory.paperless')` and returns `null` when disabled — same observable behaviour as before.
- [x] `core.redis` and `cerebrum.vectorSearch` register `capabilityCheck` callbacks; their `state` is always `unavailable` or `enabled` based on the runtime probe (no toggle).
- [x] No module continues to call `getEnv()` directly for credential gating purposes — gating goes through the helper.
- [x] Existing tests continue to pass; new tests assert that disabling a feature short-circuits the relevant code path.

## Out of Scope

- Reworking the underlying credentials (Plex remains in settings; Paperless remains in env).
- Sunset / deprecation tracking — mark `deprecated: true` is fine but no automated report yet.
