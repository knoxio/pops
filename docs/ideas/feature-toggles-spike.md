# Spike — Feature toggles (install-time and runtime)

Investigation only — recommendations, no code changes. Sibling spikes: [deployment-split](./deployment-split-spike.md), [modular-apps](./modular-apps-spike.md).

## Question

Some features should be toggleable — at install time, at runtime, or both. Examples given: Plex, Sonarr/Radarr, the "connected status" on inventory. What is the right layering so we don't end up with a flag graveyard?

## What already exists

- **Runtime settings** (`settings` table, read at request time):
  - `plex_scheduler_enabled` — gates the Plex sync cron
  - `rotation_enabled` — gates the carousel rotation feature
- **Credentials-as-toggle** (env / Docker secrets):
  - Paperless — absent `PAPERLESS_BASE_URL` / `PAPERLESS_API_TOKEN` disables the integration; thumbnail endpoint returns 404 gracefully
  - Radarr/Sonarr, TMDB, TVDB — no credentials ⇒ routes compile but calls fail soft
  - Up Bank webhook — only active if secret is set
  - Redis — API starts in a degraded mode without it (queues + cache disabled)
- **Compose profiles** for optional containers:
  - `moltbot` (opt-in Telegram bot)
  - `tools` (on-demand import runner)
- **Capability detection**: `sqlite-vec` loaded → vector search available; not loaded → search gracefully returns an "unavailable" error

What's _missing_ is a coherent story. Today a feature can be controlled by (a) an env var, (b) a secret, (c) a row in `settings`, (d) a compose profile, or (e) nothing at all — and the choice has been per-feature, case-by-case.

## Four categories — different answers for each

| Category                   | Examples                                                                                                      | Where the toggle lives                                        | Install vs runtime                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| **Whole module**           | App: finance, media, inventory, engrams, ai-admin. Overlay: search, ego                                       | Module registry (see [modular-apps](./modular-apps-spike.md)) | Install-time via `POPS_APPS` / `POPS_OVERLAYS`   |
| **External integration**   | Plex, Sonarr, Radarr, TMDB, TVDB, Up Bank, Paperless, Notion                                                  | Credentials presence + admin UI                               | Install via env; runtime enable/disable in admin |
| **Sub-feature flag**       | Rotation carousel, AI categoriser fallback, vector search, inventory connected-status indicator, debrief jobs | `settings` table, read per-request                            | Runtime only (default sensible, user toggles)    |
| **Experimental / preview** | Anything in-flight                                                                                            | Same as sub-feature, but tagged `preview: true`               | Runtime                                          |

Rule of thumb:

- **If the user might flip it more than once → runtime setting.**
- **If flipping it changes migrations or mounted routers → install-time (a module decision, not a flag).**
- **If the feature depends on an external service's existence → credentials-presence is the toggle, admin UI reads from there.**

## Proposed model

### 1. Per-module settings manifest

Each app declares what it can toggle:

```ts
// packages/app-media/src/features.ts
export const mediaFeatures: FeatureManifest = {
  plex: {
    label: 'Plex sync',
    description: 'Background job that pulls library + watch history from Plex.',
    default: false,
    requires: ['plex_url', 'plex_token'], // settings keys (env fallback supported)
    scope: 'system',
  },
  radarr: {
    label: 'Radarr',
    description: 'Request movie downloads for watchlist items.',
    default: false,
    requires: ['radarr_url', 'radarr_api_key'],
    scope: 'system',
  },
  sonarr: {
    label: 'Sonarr',
    description: 'Request TV downloads for watchlist items.',
    default: false,
    requires: ['sonarr_url', 'sonarr_api_key'],
    scope: 'system',
  },
  rotation: {
    label: 'Rotation carousel',
    description: 'Cycles featured titles on the home page.',
    default: true,
    scope: 'system',
  },
};
```

- `scope: 'system'` — admin-only toggle.
- `scope: 'user'` — per-user preference (e.g. "show connected-status badges on inventory items").
- `requires: [...]` — settings keys (see `packages/types/src/settings-keys.ts`) that must resolve to a non-empty value. Credentials live in the `settings` table today, with env-var fallback for some keys via the `envFallback` pattern. If any required key is empty in both settings and env, the toggle is visible but disabled with a "configure credentials first" hint.

The shell builds the admin Features page from the union of all active modules' manifests. No per-module ad-hoc pages.

### 2. Single read path

One helper, everywhere:

```ts
const enabled = await features.isEnabled('media.plex', { user });
```

Backed by a cached read from the `settings` table keyed by `<module>.<flag>`. Centralises runtime settings lookups and standardises credential/capability gating so each module isn't rolling its own "is the Plex scheduler enabled and do we have the credentials?" logic.

### 3. Install-time vs runtime — what lives where

- `.env` / Docker secrets: credentials only. Not feature state.
- `POPS_APPS` env: which modules to mount (see [modular-apps](./modular-apps-spike.md)). This is the install-time coarse grain.
- Compose profiles: optional _containers_ (moltbot, tools). Keep as-is.
- `settings` table: all runtime feature state. Admin UI reads and writes here.
- User preferences: in `settings` with user scope (or a separate `user_settings` table if we need per-user defaults).

### 4. Credential lifecycle

Credentials presence already acts as an implicit enable. Formalise:

- A feature that `requires: [...]` env vars is **gated** — the flag can only be `on` if the vars resolve.
- Admin UI shows the state: "Plex: credentials missing" vs "Plex: configured, enabled" vs "Plex: configured, disabled".
- Flipping credentials (rotate a token) shouldn't flip feature state — they're independent.

## The "connected status on inventory" case, concretely

This is a display-level affordance (badge on inventory items showing they're linked to Paperless receipts / photos / etc). Proper home:

- **User-scoped** runtime toggle under inventory's feature manifest: `inventory.show_connected_status`, default `true`.
- Displayed in inventory's settings section (rendered from the module's manifest).
- Implementation reads once per session via the features helper.

Not a system-wide toggle. Not an env var. Not a compile-time option.

## Advantages

- One mental model for the user: "look in the Features admin page"
- One read path for engineers: `features.isEnabled('x.y')`
- No more ad-hoc env-var checks scattered across modules
- Plays well with modular apps — each module's manifest only contributes flags when the module is installed
- Credentials and feature state stay independent, so rotating tokens doesn't lose settings
- Trivial to add "preview" / experimental flagging later

## Disadvantages / risks

- **Flag fatigue** — too many flags become unmanageable. Mitigate: every flag gets a sunset plan; quarterly review; `deprecated: true` field surfaces in a report.
- **Flag inconsistency across processes** — the API worker and the web API must see the same flag value. Cache invalidation on flag change, or short TTL (30s is fine for a single-user system).
- **Testing surface** — matrix of flag combinations explodes. Discipline: default paths are the tested path; off-by-default flags are experimental until promoted.
- **Overlap with modular apps** — a "whole module" is not a flag. Keep them separate to avoid one being used to simulate the other.
- **Silent footguns** — a flag that's off but whose dependent data still exists can confuse users. Admin UI should warn: "Disabling this will stop sync; existing data is preserved."

## Open questions

- Do we need per-user flags, or is system-scope enough for a single-user deployment? (Probably system-scope is enough; design the API for both anyway.)
- Cache strategy — TTL vs pub/sub? Redis is already optional (degraded mode), so TTL is the safer default.
- Do feature flags version with the app manifest? If the media app adds a new flag, does `POPS_APPS=media@1.1` matter, or do flags migrate freely?
- Should credentials live in the `settings` admin UI too (read-only, managed via secrets), or stay opaque (secrets only, admin UI just shows "configured yes/no")?

## Recommendation

Yes to this layering. Order of implementation:

1. Define the `FeatureManifest` type and the `features.isEnabled` helper. Small, contained.
2. Migrate existing ad-hoc toggles (`plex_scheduler_enabled`, `rotation_enabled`, paperless gating) into manifests. No behaviour change, just centralisation.
3. Build the admin Features page that renders from manifests.
4. Add `requires: [...]` credential-gating.
5. When modular apps land (see [modular-apps](./modular-apps-spike.md)), each module registers its manifest on install.

This is the smallest of the three spikes and the one with the clearest ROI. Worth doing even if we delay the other two.

## Next steps if we proceed

- PRD under theme `01-foundation`: "Feature flag framework".
- ADR: "Feature flags in the `settings` table, per-module manifests, one read path".
- Audit existing env-var checks in `apps/pops-api/src/` and migrate them one per PR.
