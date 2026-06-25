# Idea — Adopt the feature-toggle framework (migrations + first user-scoped feature)

The [feature-toggles framework](../themes/foundation/prds/feature-toggles-framework.md) is built and proven end-to-end by the two declared capability features (`core.redis`, `cerebrum.vectorSearch`). What remains is **adoption**: no `system`- or `user`-scoped feature is declared by any pillar, and the existing ad-hoc gates have not moved behind the single read path. This is centralisation work, not framework work — behaviour is preserved, the reads move.

Related: the broader [feature-toggles spike](./feature-toggles-spike.md) (layering rationale, four-category model, risks).

## Migrate existing ad-hoc toggles to manifests

Each row declares a feature in the owning pillar's manifest `features` slot and routes its gate through `isEnabled()`.

| Existing check (today)                                      | Feature key            | Scope  | Required credentials                                            |
| ----------------------------------------------------------- | ---------------------- | ------ | --------------------------------------------------------------- |
| `plex_scheduler_enabled` raw setting                        | `media.plex.scheduler` | system | `plex_url`, `plex_token` (`settingKey: plex_scheduler_enabled`) |
| `rotation_enabled` raw setting                              | `media.rotation`       | system | (none) (`settingKey: rotation_enabled`)                         |
| `process.env['PAPERLESS_BASE_URL']` + `PAPERLESS_API_TOKEN` | `inventory.paperless`  | system | env: `PAPERLESS_BASE_URL`, `PAPERLESS_API_TOKEN`                |
| Radarr URL + API key probe                                  | `media.radarr`         | system | `radarr_url`, `radarr_api_key`                                  |
| Sonarr URL + API key probe                                  | `media.sonarr`         | system | `sonarr_url`, `sonarr_api_key`                                  |

Acceptance:

- [ ] `media` declares `media.plex.scheduler` / `media.rotation` / `media.radarr` / `media.sonarr`; their gates read through `isEnabled` (no behaviour change — `settingKey` preserves the existing setting keys).
- [ ] `inventory` declares `inventory.paperless`; `getPaperlessClient()` returns `null` via `isEnabled('inventory.paperless')` instead of reading `process.env` directly. Same observable behaviour.
- [ ] The key-ownership invariant holds for the system-scoped keys (or the keys move to the registry's declared key set as part of settings federation).
- [ ] No pillar continues to call `process.env` directly for credential gating; gating goes through the helper.
- [ ] Existing tests pass; new tests assert disabling a feature short-circuits the relevant code path.

> Note: the inventory paperless module explicitly defers this — its gating stays in the pillar container "until the pillar grows its own feature gating," at which point the env check moves behind the helper.

## First user-scoped feature: `inventory.show_connected_status`

The framework and admin UI already handle `scope: 'user'` (the card routes toggles to `setUserPreference`, exposes "Reset to default", and the `user_settings` table is in place). Nothing declares a user-scoped feature yet.

Acceptance:

- [ ] `inventory` declares `inventory.show_connected_status` (`scope: 'user'`, `default: true`).
- [ ] `isEnabled('inventory.show_connected_status', { user })` returns the user override when set, otherwise the system default.
- [ ] Inventory components reading "show connected status" go through `isEnabled` / `useFeatureEnabled`.

## Navigation entry

- [ ] Add a "Features" entry to the shell navigation (the `/features` route exists but is not linked anywhere).

## Out of scope

- Reworking underlying credentials (Plex stays in settings; Paperless stays in env).
- Automated sunset/deprecation reporting (the `deprecated` field is captured; the report is future work).
- Migrating other UI affordances to user-scoped features beyond `inventory.show_connected_status`.
