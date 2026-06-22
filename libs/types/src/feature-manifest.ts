/**
 * Feature manifest types — shared between API (registry / service) and frontend
 * (admin Features page renderer).
 *
 * Sits on top of the settings system (PRD-093). A feature is an on/off
 * capability; its credential dependencies are settings keys. The runtime
 * `features.isEnabled()` helper is the single read path for runtime gating.
 */

/**
 * Runtime scope of a feature.
 * - `system`     — admin-only, single value across the deployment
 * - `user`       — per-user override on top of the system default
 * - `capability` — read-only runtime probe (Redis, sqlite-vec)
 */
export type FeatureScope = 'system' | 'user' | 'capability';

export interface FeatureDefinition {
  /** Globally unique key, namespaced by module: `media.plex.scheduler`. */
  key: string;
  label: string;
  description?: string;
  /** Default state when no override is set and no gating is failing. */
  default: boolean;
  scope: FeatureScope;
  /**
   * Settings keys whose resolved value (DB or `envFallback`) must be non-empty
   * for the feature to be activatable. Mirrors PRD-093 semantics — empty list
   * means no credential gating.
   */
  requires?: string[];
  /**
   * Environment variables required when the credential is env-only (Docker
   * secret / dotenv). Treated identically to `requires`, resolved via
   * `getEnv()` rather than the settings table.
   */
  requiresEnv?: string[];
  /** Tag the feature as preview/experimental for grouping purposes. */
  preview?: boolean;
  /** Mark for sunset planning. Surfaces in audit reports. */
  deprecated?: boolean;
  /**
   * Setting key that backs the system-level enabled state. Defaults to
   * `feature.key`. Lets a feature reuse a pre-existing setting key
   * (e.g. `media.plex.scheduler` reads `plex_scheduler_enabled`).
   */
  settingKey?: string;
  /** Anchor link to the relevant Settings section: `/settings#media.plex`. */
  configureLink?: string;
  /**
   * Capability detector — returns `true` when the underlying runtime supports
   * this feature (Redis available, sqlite-vec loaded). When defined, a `false`
   * return makes the feature `unavailable` regardless of settings or requires.
   *
   * Stripped before serialisation by the API; never reaches the frontend.
   */
  capabilityCheck?: () => boolean;
}

export interface FeatureManifest {
  /** Module ID: `media`, `inventory`, `core`. Matches SettingsManifest convention. */
  id: string;
  title: string;
  icon?: string;
  order: number;
  features: FeatureDefinition[];
}

/** Runtime status of a feature — what the API returns to the admin page. */
export interface FeatureStatus {
  key: string;
  manifestId: string;
  label: string;
  description?: string;
  scope: FeatureScope;
  /** Resolved enabled state (after capability + credentials + override + default). */
  enabled: boolean;
  default: boolean;
  /**
   * Coarse status for the UI:
   * - `enabled`: the feature is currently on
   * - `disabled`: gating passes but the toggle is off
   * - `unavailable`: capability or required credentials missing
   */
  state: 'enabled' | 'disabled' | 'unavailable';
  /** Per-required-credential resolution. */
  credentials: FeatureCredentialStatus[];
  /** True when the capability check returned false. */
  capabilityMissing?: boolean;
  preview?: boolean;
  deprecated?: boolean;
  configureLink?: string;
  /** True when a per-user override is set (only meaningful for `scope: 'user'`). */
  userOverride?: boolean;
}

export interface FeatureCredentialStatus {
  key: string;
  /** Where the value comes from. `missing` means neither DB nor env. */
  source: 'database' | 'environment' | 'missing';
  /** Set when the resolution involved an env var (fallback or `requiresEnv`). */
  envVar?: string;
}
