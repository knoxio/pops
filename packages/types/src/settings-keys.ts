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

  // Cerebrum — Query Engine
  CEREBRUM_QUERY_MODEL: 'cerebrum.query.model',
  CEREBRUM_QUERY_MAX_SOURCES: 'cerebrum.query.maxSources',
  CEREBRUM_QUERY_RELEVANCE_THRESHOLD: 'cerebrum.query.relevanceThreshold',
  CEREBRUM_QUERY_TOKEN_BUDGET: 'cerebrum.query.tokenBudget',

  // Cerebrum — Emit (Document Generation)
  CEREBRUM_EMIT_MODEL: 'cerebrum.emit.model',
  CEREBRUM_EMIT_MAX_TOKENS: 'cerebrum.emit.maxTokens',
  CEREBRUM_EMIT_RELEVANCE_THRESHOLD: 'cerebrum.emit.relevanceThreshold',
  CEREBRUM_EMIT_MAX_SOURCES: 'cerebrum.emit.maxSources',
  CEREBRUM_EMIT_TOKEN_BUDGET: 'cerebrum.emit.tokenBudget',

  // Cerebrum — Retrieval
  CEREBRUM_SEMANTIC_DEFAULT_LIMIT: 'cerebrum.semantic.defaultLimit',
  CEREBRUM_SEMANTIC_DEFAULT_THRESHOLD: 'cerebrum.semantic.defaultThreshold',
  CEREBRUM_SEMANTIC_QUERY_CACHE_TTL: 'cerebrum.semantic.queryCacheTtl',
  CEREBRUM_HYBRID_RRF_K: 'cerebrum.hybrid.rrfK',
  CEREBRUM_HYBRID_DEFAULT_LIMIT: 'cerebrum.hybrid.defaultLimit',
  CEREBRUM_HYBRID_DEFAULT_THRESHOLD: 'cerebrum.hybrid.defaultThreshold',
  CEREBRUM_CONTEXT_TOKEN_BUDGET: 'cerebrum.context.tokenBudget',

  // Cerebrum — Ingest
  CEREBRUM_CLASSIFIER_MODEL: 'cerebrum.classifier.model',
  CEREBRUM_CLASSIFIER_CONFIDENCE_THRESHOLD: 'cerebrum.classifier.confidenceThreshold',
  CEREBRUM_ENTITY_EXTRACTOR_MODEL: 'cerebrum.entityExtractor.model',
  CEREBRUM_ENTITY_EXTRACTOR_CONFIDENCE_THRESHOLD: 'cerebrum.entityExtractor.confidenceThreshold',
  CEREBRUM_SCOPE_INFERENCE_MODEL: 'cerebrum.scopeInference.model',

  // Cerebrum — Nudges
  CEREBRUM_NUDGE_CONSOLIDATION_SIMILARITY: 'cerebrum.nudge.consolidationSimilarity',
  CEREBRUM_NUDGE_CONSOLIDATION_MIN_CLUSTER: 'cerebrum.nudge.consolidationMinCluster',
  CEREBRUM_NUDGE_STALENESS_DAYS: 'cerebrum.nudge.stalenessDays',
  CEREBRUM_NUDGE_PATTERN_MIN_OCCURRENCES: 'cerebrum.nudge.patternMinOccurrences',
  CEREBRUM_NUDGE_MAX_PENDING: 'cerebrum.nudge.maxPending',
  CEREBRUM_NUDGE_COOLDOWN_HOURS: 'cerebrum.nudge.cooldownHours',

  // Cerebrum — Engrams
  CEREBRUM_ENGRAM_FALLBACK_SCOPE: 'cerebrum.engram.fallbackScope',

  // Cerebrum — Citation Parser
  CEREBRUM_CITATION_EXCERPT_MAX_LENGTH: 'cerebrum.citation.excerptMaxLength',

  // Cerebrum — Plexus (adapter lifecycle)
  CEREBRUM_PLEXUS_HEALTH_INTERVAL_MS: 'cerebrum.plexus.healthIntervalMs',
  CEREBRUM_PLEXUS_HEALTH_TIMEOUT_MS: 'cerebrum.plexus.healthTimeoutMs',
  CEREBRUM_PLEXUS_MAX_CONSECUTIVE_FAILURES: 'cerebrum.plexus.maxConsecutiveFailures',

  // Cerebrum — Thalamus
  CEREBRUM_THALAMUS_CROSS_SOURCE_INTERVAL_MS: 'cerebrum.thalamus.crossSourceIntervalMs',

  // Cerebrum — MCP
  CEREBRUM_MCP_QUERY_MAX_SOURCES: 'cerebrum.mcp.queryMaxSources',
  CEREBRUM_MCP_SEARCH_SNIPPET_LENGTH: 'cerebrum.mcp.searchSnippetLength',
  CEREBRUM_MCP_SEARCH_DEFAULT_LIMIT: 'cerebrum.mcp.searchDefaultLimit',

  // Cerebrum — Glia (trust graduation)
  CEREBRUM_GLIA_PROPOSE_MIN_APPROVED: 'cerebrum.glia.proposeMinApproved',
  CEREBRUM_GLIA_PROPOSE_MAX_REJECTION_RATE: 'cerebrum.glia.proposeMaxRejectionRate',
  CEREBRUM_GLIA_ACT_REPORT_MIN_DAYS: 'cerebrum.glia.actReportMinDays',
  CEREBRUM_GLIA_DEMOTION_REVERT_THRESHOLD: 'cerebrum.glia.demotionRevertThreshold',
  CEREBRUM_GLIA_DEMOTION_WINDOW_DAYS: 'cerebrum.glia.demotionWindowDays',

  // Ego — Conversation Engine
  EGO_DEFAULT_MODEL: 'ego.defaultModel',
  EGO_MAX_HISTORY: 'ego.maxHistory',
  EGO_MAX_RETRIEVAL: 'ego.maxRetrieval',
  EGO_TOKEN_BUDGET: 'ego.tokenBudget',
  EGO_RELEVANCE_THRESHOLD: 'ego.relevanceThreshold',

  // Ego — LLM Client
  EGO_CHAT_MAX_TOKENS: 'ego.chat.maxTokens',
  EGO_CHAT_TEMPERATURE: 'ego.chat.temperature',
  EGO_SUMMARY_MAX_TOKENS: 'ego.summary.maxTokens',
  EGO_SUMMARY_TEMPERATURE: 'ego.summary.temperature',

  // Media — Comparisons
  MEDIA_COMPARISONS_ELO_K: 'media.comparisons.eloK',
  MEDIA_COMPARISONS_DEFAULT_SCORE: 'media.comparisons.defaultScore',
  MEDIA_COMPARISONS_MAX_TIER_LIST_MOVIES: 'media.comparisons.maxTierListMovies',
  MEDIA_COMPARISONS_STALENESS_THRESHOLD: 'media.comparisons.stalenessThreshold',
  MEDIA_COMPARISONS_DEFAULT_LIMIT: 'media.comparisons.defaultLimit',

  // Media — Discovery
  MEDIA_DISCOVERY_SESSION_TARGET_MIN: 'media.discovery.sessionTargetMin',
  MEDIA_DISCOVERY_SESSION_TARGET_MAX: 'media.discovery.sessionTargetMax',
  MEDIA_DISCOVERY_MAX_SEED_SHELVES: 'media.discovery.maxSeedShelves',
  MEDIA_DISCOVERY_MAX_GENRE_SHELVES: 'media.discovery.maxGenreShelves',
  MEDIA_DISCOVERY_MAX_ACTIVE_COLLECTIONS: 'media.discovery.maxActiveCollections',
  MEDIA_DISCOVERY_MAX_BYW_SEEDS: 'media.discovery.maxBecauseYouWatchedSeeds',
  MEDIA_DISCOVERY_MAX_CREDITS_SEEDS: 'media.discovery.maxCreditsSeeds',
  MEDIA_DISCOVERY_MAX_BEST_IN_GENRE: 'media.discovery.maxBestInGenre',
  MEDIA_DISCOVERY_MAX_CROSSOVER_PAIRS: 'media.discovery.maxCrossoverPairs',

  // Media — Integrations
  MEDIA_THETVDB_RATE_LIMIT_CAPACITY: 'media.thetvdb.rateLimitCapacity',
  MEDIA_THETVDB_RATE_LIMIT_REFILL_RATE: 'media.thetvdb.rateLimitRefillRate',
  MEDIA_THETVDB_MAX_RETRIES: 'media.thetvdb.maxRetries',
  MEDIA_TMDB_GENRE_CACHE_TTL_MS: 'media.tmdb.genreCacheTtlMs',
  MEDIA_TMDB_IMAGE_MAX_RETRIES: 'media.tmdb.imageMaxRetries',
  MEDIA_TMDB_IMAGE_RETRY_DELAY_MS: 'media.tmdb.imageRetryDelayMs',
  MEDIA_PLEX_RATE_LIMIT_DELAY_MS: 'media.plex.rateLimitDelayMs',
  MEDIA_PLEX_CLIENT_PAGE_SIZE: 'media.plex.clientPageSize',
  MEDIA_PLEX_FRIENDS_PAGE_SIZE: 'media.plex.friendsPageSize',
  MEDIA_DEFAULT_LIMIT: 'media.defaultLimit',
  MEDIA_ROTATION_TMDB_DEFAULT_PAGES: 'media.rotation.tmdbDefaultPages',
  MEDIA_ROTATION_TMDB_MAX_PAGES: 'media.rotation.tmdbMaxPages',
  MEDIA_ROTATION_TMDB_MIN_VOTE_COUNT: 'media.rotation.tmdbMinVoteCount',
  MEDIA_ROTATION_LETTERBOXD_MAX_PAGES: 'media.rotation.letterboxdMaxPages',

  // Finance
  FINANCE_AI_CATEGORIZER_MODEL: 'finance.aiCategorizer.model',
  FINANCE_AI_CATEGORIZER_MAX_TOKENS: 'finance.aiCategorizer.maxTokens',
  FINANCE_RULE_GEN_MODEL: 'finance.ruleGen.model',
  FINANCE_RULE_GEN_MAX_TOKENS: 'finance.ruleGen.maxTokens',
  FINANCE_DEFAULT_LIMIT: 'finance.defaultLimit',

  // Inventory
  INVENTORY_DEFAULT_LIMIT: 'inventory.defaultLimit',
  INVENTORY_SEARCH_DEFAULT_LIMIT: 'inventory.searchDefaultLimit',
  INVENTORY_MAX_FILE_SIZE_BYTES: 'inventory.maxFileSizeBytes',

  // Core — Corrections
  CORE_CORRECTIONS_HIGH_CONFIDENCE: 'core.corrections.highConfidenceThreshold',
  CORE_CORRECTIONS_MIN_PATTERN_LENGTH: 'core.corrections.minPatternLength',
  CORE_CORRECTIONS_PREVIEW_LIMIT: 'core.corrections.previewLimit',
  CORE_CORRECTIONS_PREVIEW_HARD_LIMIT: 'core.corrections.previewHardLimit',
  CORE_CORRECTIONS_PREVIEW_RULES_FETCH: 'core.corrections.previewRulesFetchLimit',

  // Core — Search
  CORE_SEARCH_SHOW_MORE_LIMIT: 'core.search.showMoreLimit',

  // Core — AI Retry
  CORE_AI_RETRY_MAX_RETRIES: 'core.aiRetry.maxRetries',
  CORE_AI_RETRY_BASE_DELAY_MS: 'core.aiRetry.baseDelayMs',

  // Core — Pagination
  CORE_DEFAULT_LIMIT: 'core.defaultLimit',

  // Core — Queue
  CORE_QUEUE_SYNC_CONCURRENCY: 'core.queue.syncConcurrency',
  CORE_QUEUE_EMBEDDINGS_CONCURRENCY: 'core.queue.embeddingsConcurrency',
  CORE_QUEUE_DEFAULT_CONCURRENCY: 'core.queue.defaultConcurrency',
  CORE_QUEUE_COMPLETED_RETENTION: 'core.queue.completedRetention',

  // App
  THEME: 'theme',
} as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

/** All valid settings key values as an array — used for z.enum() validation. */
export const SETTINGS_KEY_VALUES = Object.values(SETTINGS_KEYS) as [SettingsKey, ...SettingsKey[]];
