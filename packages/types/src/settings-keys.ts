/**
 * Typed settings key registry — single source of truth for all settings keys.
 *
 * Every key stored in the `settings` table must be listed here.
 * Import `SETTINGS_KEYS` and `SettingsKey` instead of using magic strings.
 */
export const SETTINGS_KEYS = {
  // Plex
  PLEX_URL: 'plex_url',
  PLEX_TOKEN: 'plex_token',
  PLEX_USERNAME: 'plex_username',
  PLEX_ENCRYPTION_SEED: 'plex_encryption_seed',
  PLEX_CLIENT_IDENTIFIER: 'plex_client_identifier',
  PLEX_MOVIE_SECTION_ID: 'plex_movie_section_id',
  PLEX_TV_SECTION_ID: 'plex_tv_section_id',
  PLEX_SCHEDULER_ENABLED: 'plex_scheduler_enabled',
  PLEX_SCHEDULER_INTERVAL_MS: 'plex_scheduler_interval_ms',

  // Radarr / Sonarr
  RADARR_URL: 'radarr_url',
  RADARR_API_KEY: 'radarr_api_key',
  SONARR_URL: 'sonarr_url',
  SONARR_API_KEY: 'sonarr_api_key',

  // AI
  AI_MODEL: 'ai.model',
  AI_MONTHLY_TOKEN_BUDGET: 'ai.monthlyTokenBudget',
  AI_BUDGET_EXCEEDED_FALLBACK: 'ai.budgetExceededFallback',

  // App
  THEME: 'theme',
} as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

/** All valid settings key values as an array — used for z.enum() validation. */
export const SETTINGS_KEY_VALUES = Object.values(SETTINGS_KEYS) as [SettingsKey, ...SettingsKey[]];
