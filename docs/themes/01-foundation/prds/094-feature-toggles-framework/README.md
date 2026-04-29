# PRD-094: Feature Toggles Framework

> Epic: [09 — Feature Toggles](../../epics/09-feature-toggles.md)
> Status: In progress

## Overview

A unified runtime feature-toggle layer built on top of the existing settings system (PRD-093). Each module declares a `FeatureManifest` of toggleable features. A single `features.isEnabled(featureKey, { user? })` helper resolves the runtime answer by combining: capability detection, required credential presence, system-level enable/disable state, and per-user overrides. The Admin Features page renders the union of all registered manifests, showing each feature's state and credential status — replacing scattered ad-hoc env-var checks and hand-rolled toggle reads.

This is the layer **above** PRD-093 (which provides settings storage, manifests, and the Settings page). Feature toggles are a different concept: a setting is a configuration value, a feature is an on/off capability that may depend on settings, environment, and runtime probes.

## Data Model

### FeatureManifest (TypeScript, not DB)

```ts
type FeatureScope = 'system' | 'user' | 'capability';

interface FeatureDefinition {
  /** Globally unique feature key, namespaced by module: 'media.plex'. */
  key: string;
  label: string;
  description?: string;
  /** Default state when no override exists. */
  default: boolean;
  scope: FeatureScope;
  /**
   * Settings keys whose resolved value (DB or env fallback) must be non-empty
   * for the feature to be activatable. Empty list = no credential gating.
   */
  requires?: string[];
  /**
   * Environment variables required when the feature is gated by env-only secrets
   * (e.g. Paperless). Treated identically to `requires` but consulted via env.
   */
  requiresEnv?: string[];
  /** Tag experimental features so the UI can group them separately. */
  preview?: boolean;
  /** Mark for sunset planning — surfaces in audit reports. */
  deprecated?: boolean;
  /**
   * Capability detector — returns true when the underlying runtime supports
   * this feature (Redis available, sqlite-vec loaded). When defined, a false
   * return makes the feature 'unavailable' regardless of settings or requires.
   */
  capabilityCheck?: () => boolean;
  /** Anchor link to the relevant settings section: '/settings#media.plex'. */
  configureLink?: string;
  /**
   * Settings key that backs the system-level enabled state. Defaults to the
   * feature's own `key`. Some features back onto pre-existing keys
   * (e.g. `media.plex.scheduler` reads `plex_scheduler_enabled`).
   */
  settingKey?: string;
}

interface FeatureManifest {
  /** Module ID, matches the SettingsManifest convention: 'media', 'core'. */
  id: string;
  title: string;
  icon?: string;
  order: number;
  features: FeatureDefinition[];
}
```

### `user_settings` table (per-user preferences)

```sql
CREATE TABLE user_settings (
  user_email TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  PRIMARY KEY (user_email, key)
);
CREATE INDEX idx_user_settings_user ON user_settings(user_email);
```

User-scoped feature state lives here, keyed by the authenticated user's email (single-user system today, designed for multi-user). The system-scoped settings continue to live in the existing `settings` table.

## API Surface

| Procedure                           | Input              | Output                             | Notes                                                              |
| ----------------------------------- | ------------------ | ---------------------------------- | ------------------------------------------------------------------ |
| `core.features.list`                | —                  | `{ features: FeatureStatus[] }`    | All features with resolved state, credential status, manifest meta |
| `core.features.getManifests`        | —                  | `{ manifests: FeatureManifest[] }` | Raw manifests grouped by module, sorted by `order`                 |
| `core.features.isEnabled`           | `{ key }`          | `{ enabled: boolean }`             | Runtime check with current request user context                    |
| `core.features.setEnabled`          | `{ key, enabled }` | `{ enabled: boolean }`             | Writes system-level state (rejects when credentials are missing)   |
| `core.features.setUserPreference`   | `{ key, enabled }` | `{ enabled: boolean }`             | Writes per-user override (404 when feature is not user-scoped)     |
| `core.features.clearUserPreference` | `{ key }`          | `{ cleared: boolean }`             | Removes the user override (falls back to system default)           |

Where `FeatureStatus` is:

```ts
interface FeatureStatus {
  key: string;
  manifestId: string;
  label: string;
  description?: string;
  scope: 'system' | 'user' | 'capability';
  enabled: boolean;
  default: boolean;
  /** 'enabled' | 'disabled' | 'unavailable' (capability/credentials missing). */
  state: 'enabled' | 'disabled' | 'unavailable';
  /** Per-required-key configured / missing, with env-vs-db source. */
  credentials: Array<{
    key: string;
    source: 'database' | 'environment' | 'missing';
    envVar?: string;
  }>;
  preview?: boolean;
  deprecated?: boolean;
  configureLink?: string;
  /** True when capability check returned false. */
  capabilityMissing?: boolean;
  /** When user-scoped: whether the user has set a personal override. */
  userOverride?: boolean;
}
```

## Business Rules

- Each module owns its FeatureManifest. Manifests are registered at API startup via `featuresRegistry.register(manifest)` — exactly mirroring the SettingsRegistry pattern.
- Duplicate feature keys across manifests cause a startup error. The same feature key cannot be claimed twice.
- `features.isEnabled(key, { user? })` is the single read path. Modules MUST NOT implement their own toggle reads.
- Resolution order in `isEnabled`:
  1. `capabilityCheck()` → if defined and returns `false` → feature is **unavailable**, returns `false`.
  2. `requires[]` settings → resolve each via DB then `envFallback`. Any missing → unavailable, returns `false`.
  3. `requiresEnv[]` env vars → resolved via `getEnv()`. Any missing → unavailable, returns `false`.
  4. `scope: 'user'` and a `user` was passed → return user override if set.
  5. System-level state from `settingKey ?? key` → returns the boolean if set.
  6. Otherwise → return `feature.default`.
- Setting a feature's enabled state is rejected when its credentials/capability gate is missing — UI must show the gate before allowing the toggle.
- The Admin Features page is rendered from the union of all registered manifests, grouped by `manifestId`, sorted by `order`.
- Per-user preferences are keyed by the authenticated email (`ctx.user.email`). Anonymous contexts cannot read or write user-scoped state.
- Capability features (Redis, sqlite-vec) cannot be toggled by the user — they reflect runtime probes, not configuration.
- The `requires[]` keys reuse the same registry semantics from PRD-093 (env fallback, sensitive masking) — feature-toggle credential rendering links back to the relevant settings section.

## Edge Cases

| Case                                                          | Behaviour                                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Feature has no `requires`, no `capabilityCheck`               | Toggle is freely flippable; resolves from system setting then default                           |
| `requires` lists a key that no settings manifest declares     | Treated as missing (always); operator gets a startup warning                                    |
| Capability feature is toggled in admin                        | UI does not render a toggle — only a status badge                                               |
| User-scoped feature read without a user context               | Falls back to system state (warning logged in dev)                                              |
| Feature's `settingKey` differs from `key`                     | System read uses `settingKey`; admin save also writes `settingKey`                              |
| Existing setting value is `'true'`/`'false'`                  | Parsed as boolean; any other string is treated as `false`                                       |
| Per-user override set, then `clearUserPreference` is called   | Resolution falls back to system default                                                         |
| Feature requires env var that's set in dev but absent in prod | `requiresEnv` evaluation uses `getEnv()` so Docker secrets work the same as env vars            |
| Two manifests register the same key                           | Startup throws an explicit error (mirrors SettingsRegistry behaviour)                           |
| Module is not loaded (modular apps, future)                   | Its manifest never registers; the feature does not exist; `isEnabled` returns `false` and warns |

## User Stories

| #   | Story                                                                     | Summary                                                                                      | Status      | Parallelisable   |
| --- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------- | ---------------- |
| 01  | [us-01-feature-manifest-and-helper](us-01-feature-manifest-and-helper.md) | Define FeatureManifest, registry, `features.isEnabled()` with capability + credential gating | In progress | No (first)       |
| 02  | [us-02-migrate-existing-toggles](us-02-migrate-existing-toggles.md)       | Migrate plex/rotation/paperless/radarr/sonarr/redis/sqlite-vec toggles to manifests          | In progress | Blocked by us-01 |
| 03  | [us-03-admin-features-page](us-03-admin-features-page.md)                 | `/features` admin page rendering manifests with state and toggle controls                    | In progress | Blocked by us-01 |
| 04  | [us-04-credential-gating](us-04-credential-gating.md)                     | UI: configured/missing chips, disable toggle when credentials missing, link to settings      | In progress | Blocked by us-03 |
| 05  | [us-05-per-user-preferences](us-05-per-user-preferences.md)               | `user_settings` table, scope: 'user' resolution, `setUserPreference` procedure               | In progress | Blocked by us-01 |

## Verification

- `features.isEnabled('media.plex.scheduler')` returns `false` until both `plex_url` and `plex_token` are set; flipping the admin toggle to `true` then enables it.
- Disconnecting Redis flips the `core.redis` capability badge to "Unavailable" without changing any setting.
- `features.isEnabled('inventory.show_connected_status', { user })` returns the user override when one is set, the system default otherwise.
- The Admin Features page lists every registered feature; capability-only features render a status pill (not a switch).
- Removing `PAPERLESS_BASE_URL` from env makes `inventory.paperless` unavailable on next request.

## Out of Scope

- Module-level "whole app" gates (modular apps spike — separate effort).
- Compose-profile toggles (moltbot, tools containers — already covered by Docker profiles).
- Multi-user authorisation, role-based feature exposure.
- Sunset/deprecation reporting UI (the field is captured; the report is future work).
- A/B experiments, percentage rollouts, multi-variant flags.

## Drift Check

last checked: 2026-04-29
