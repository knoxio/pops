/**
 * Typed settings key registry — single source of truth for all settings keys.
 *
 * Every key stored in the `settings` table must be listed here.
 * Import `SETTINGS_KEYS` and `SettingsKey` instead of using magic strings.
 */
export const SETTINGS_KEYS = {
  // Plex — connection & sync
  PLEX_URL: 'plex_url',
  PLEX_TOKEN: 'plex_token',
  PLEX_USERNAME: 'plex_username',
  PLEX_ENCRYPTION_SEED: 'plex_encryption_seed',
  PLEX_CLIENT_IDENTIFIER: 'plex_client_identifier',
  PLEX_MOVIE_SECTION_ID: 'plex_movie_section_id',
  PLEX_TV_SECTION_ID: 'plex_tv_section_id',
  PLEX_SCHEDULER_ENABLED: 'plex_scheduler_enabled',
  PLEX_SCHEDULER_INTERVAL_MS: 'plex_scheduler_interval_ms',
  PLEX_RATE_LIMIT_DELAY_MS: 'plex_rate_limit_delay_ms',
  PLEX_PREVIEW_LIMIT: 'plex_preview_limit',

  // Radarr / Sonarr
  RADARR_URL: 'radarr_url',
  RADARR_API_KEY: 'radarr_api_key',
  SONARR_URL: 'sonarr_url',
  SONARR_API_KEY: 'sonarr_api_key',

  // Rotation
  ROTATION_ENABLED: 'rotation_enabled',
  ROTATION_CRON_EXPRESSION: 'rotation_cron_expression',
  ROTATION_TARGET_FREE_GB: 'rotation_target_free_gb',
  ROTATION_AVG_MOVIE_GB: 'rotation_avg_movie_gb',
  ROTATION_PROTECTED_DAYS: 'rotation_protected_days',
  ROTATION_DAILY_ADDITIONS: 'rotation_daily_additions',
  ROTATION_LEAVING_DAYS: 'rotation_leaving_days',
  ROTATION_TMDB_MIN_VOTE_COUNT: 'rotation_tmdb_min_vote_count',

  // TheTVDB
  THETVDB_CAPACITY: 'thetvdb_capacity',
  THETVDB_REFILL_RATE: 'thetvdb_refill_rate',
  THETVDB_MAX_RETRIES: 'thetvdb_max_retries',
  THETVDB_BASE_DELAY_MS: 'thetvdb_base_delay_ms',

  // TMDB
  TMDB_IMAGE_MAX_RETRIES: 'tmdb_image_max_retries',
  TMDB_IMAGE_RETRY_DELAY_MS: 'tmdb_image_retry_delay_ms',

  // Comparisons
  COMPARISONS_MAX_TIER_LIST_MOVIES: 'comparisons_max_tier_list_movies',
  COMPARISONS_STALENESS_THRESHOLD: 'comparisons_staleness_threshold',
  COMPARISONS_DEFAULT_SCORE: 'comparisons_default_score',

  // Discovery — session assembly
  DISCOVERY_SESSION_TARGET_MIN: 'discovery_session_target_min',
  DISCOVERY_SESSION_TARGET_MAX: 'discovery_session_target_max',
  DISCOVERY_MAX_SEED_SHELVES: 'discovery_max_seed_shelves',
  DISCOVERY_MAX_GENRE_SHELVES: 'discovery_max_genre_shelves',
  DISCOVERY_MAX_LOCAL_PER_WINDOW: 'discovery_max_local_per_window',
  DISCOVERY_MAX_BEST_IN_GENRE: 'discovery_max_best_in_genre',
  DISCOVERY_MAX_CROSSOVER_PAIRS: 'discovery_max_crossover_pairs',
  DISCOVERY_MAX_TOP_DIMENSION: 'discovery_max_top_dimension',
  DISCOVERY_MAX_DIMENSION_INSPIRED: 'discovery_max_dimension_inspired',

  // AI
  AI_MODEL: 'ai.model',
  AI_MONTHLY_TOKEN_BUDGET: 'ai.monthlyTokenBudget',
  AI_BUDGET_EXCEEDED_FALLBACK: 'ai.budgetExceededFallback',

  // Finance — AI categorizer
  FINANCE_AI_CATEGORIZER_MODEL: 'finance_ai_categorizer_model',
  FINANCE_AI_CATEGORIZER_MAX_TOKENS: 'finance_ai_categorizer_max_tokens',

  // Finance — import progress
  FINANCE_IMPORT_CLEANUP_DELAY_MS: 'finance_import_cleanup_delay_ms',

  // Finance — pagination
  FINANCE_TRANSACTIONS_DEFAULT_LIMIT: 'finance_transactions_default_limit',
  FINANCE_BUDGETS_DEFAULT_LIMIT: 'finance_budgets_default_limit',
  FINANCE_WISHLIST_DEFAULT_LIMIT: 'finance_wishlist_default_limit',

  // Inventory — pagination
  INVENTORY_ITEMS_DEFAULT_LIMIT: 'inventory_items_default_limit',
  INVENTORY_CONNECTIONS_DEFAULT_LIMIT: 'inventory_connections_default_limit',
  INVENTORY_PHOTOS_DEFAULT_LIMIT: 'inventory_photos_default_limit',
  INVENTORY_DOCUMENTS_DEFAULT_LIMIT: 'inventory_documents_default_limit',
  INVENTORY_DOCUMENT_FILES_DEFAULT_LIMIT: 'inventory_document_files_default_limit',

  // Inventory — constraints
  INVENTORY_MAX_FILE_SIZE_BYTES: 'inventory_max_file_size_bytes',
  INVENTORY_MAX_GRAPH_DEPTH: 'inventory_max_graph_depth',

  // Core — corrections
  CORRECTIONS_HIGH_CONFIDENCE_THRESHOLD: 'corrections_high_confidence_threshold',

  // Core/shared — pagination
  SHARED_PAGINATION_DEFAULT_LIMIT: 'shared_pagination_default_limit',
  SHARED_PAGINATION_MAX_LIMIT: 'shared_pagination_max_limit',

  // Core — AI retry
  AI_RETRY_MAX_RETRIES: 'ai_retry_max_retries',
  AI_RETRY_BASE_DELAY_MS: 'ai_retry_base_delay_ms',

  // Core — rate limiter
  RATE_LIMIT_WINDOW_MS: 'rate_limit_window_ms',
  RATE_LIMIT_MAX_REQUESTS: 'rate_limit_max_requests',

  // Core — queue concurrency
  QUEUE_SYNC_CONCURRENCY: 'queue_sync_concurrency',
  QUEUE_EMBEDDINGS_CONCURRENCY: 'queue_embeddings_concurrency',
  QUEUE_CURATION_CONCURRENCY: 'queue_curation_concurrency',
  QUEUE_DEFAULT_CONCURRENCY: 'queue_default_concurrency',

  // Core — env TTL watcher
  ENV_TTL_WATCHER_INTERVAL_MS: 'env_ttl_watcher_interval_ms',

  // App
  THEME: 'theme',
} as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

/** All valid settings key values as an array — used for z.enum() validation. */
export const SETTINGS_KEY_VALUES = Object.values(SETTINGS_KEYS) as [SettingsKey, ...SettingsKey[]];
