/**
 * GENERATED FILE — do not edit by hand.
 *
 * Built from `packages/module-registry/scripts/known-modules.ts` by
 * `pnpm registry:build`. CI verifies this file is up to date; commit
 * regenerated output alongside any change to the source manifest list.
 *
 * See `docs/themes/01-foundation/prds/101-plugin-contract/us-02-build-time-registry.md`.
 */

import type { SettingsManifest } from '@pops/types';

export const KNOWN_MODULES = [
  'ai',
  'cerebrum',
  'core',
  'ego',
  'finance',
  'inventory',
  'media',
] as const;

export const MODULES = [
  {
    id: 'ai',
    name: 'AI Ops',
    version: '0.1.0',
    surfaces: ['app'] as const,
    description: 'AI usage, providers, model config, prompts, and rules browser.',
    hasBackend: false,
    hasFrontend: false,
  },
  {
    id: 'cerebrum',
    name: 'Cerebrum',
    version: '0.1.0',
    surfaces: ['app'] as const,
    description:
      'Engram storage, retrieval, ingest/emit, plexus, reflex, glia — knowledge graph and agents.',
    hasBackend: false,
    hasFrontend: false,
    settings: [
      {
        id: 'cerebrum',
        title: 'Cerebrum',
        icon: 'Brain',
        order: 300,
        groups: [
          {
            id: 'query',
            title: 'Query Engine',
            description:
              'Natural-language Q&A pipeline settings. Model selection lives under AI Configuration → Per-Pipeline Model Overrides.',
            fields: [
              {
                key: 'cerebrum.query.maxSources',
                label: 'Max Sources',
                type: 'number',
                default: '10',
                description: 'Maximum number of sources to retrieve per query.',
                validation: {
                  min: 1,
                  max: 100,
                },
              },
              {
                key: 'cerebrum.query.relevanceThreshold',
                label: 'Relevance Threshold',
                type: 'number',
                default: '0.3',
                description: 'Minimum relevance score for retrieved sources (0-1).',
                validation: {
                  min: 0,
                  max: 1,
                },
              },
              {
                key: 'cerebrum.query.tokenBudget',
                label: 'Token Budget',
                type: 'number',
                default: '4096',
                description: 'Maximum tokens for the context window passed to the LLM.',
                validation: {
                  min: 256,
                },
              },
            ],
          },
          {
            id: 'emit',
            title: 'Document Generation',
            description:
              'Report, summary, and timeline generation settings. Model selection lives under AI Configuration → Per-Pipeline Model Overrides.',
            fields: [
              {
                key: 'cerebrum.emit.maxTokens',
                label: 'Generation Max Tokens',
                type: 'number',
                default: '2048',
                description: 'Maximum tokens for LLM document generation output.',
                validation: {
                  min: 256,
                },
              },
              {
                key: 'cerebrum.emit.relevanceThreshold',
                label: 'Relevance Threshold',
                type: 'number',
                default: '0.2',
                description: 'Minimum relevance score for emit retrieval (0-1).',
                validation: {
                  min: 0,
                  max: 1,
                },
              },
              {
                key: 'cerebrum.emit.maxSources',
                label: 'Max Sources',
                type: 'number',
                default: '20',
                description: 'Maximum sources retrieved for document generation.',
                validation: {
                  min: 1,
                  max: 200,
                },
              },
              {
                key: 'cerebrum.emit.tokenBudget',
                label: 'Token Budget',
                type: 'number',
                default: '8192',
                description: 'Token budget for the assembled context window.',
                validation: {
                  min: 256,
                },
              },
            ],
          },
          {
            id: 'retrieval',
            title: 'Retrieval',
            description: 'Semantic search, hybrid search, and context assembly settings.',
            fields: [
              {
                key: 'cerebrum.semantic.defaultLimit',
                label: 'Semantic Default Limit',
                type: 'number',
                default: '20',
                description: 'Default number of results from semantic search.',
                validation: {
                  min: 1,
                  max: 200,
                },
              },
              {
                key: 'cerebrum.semantic.defaultThreshold',
                label: 'Semantic Default Threshold',
                type: 'number',
                default: '0.8',
                description: 'Default distance threshold for semantic search (0-1).',
                validation: {
                  min: 0,
                  max: 1,
                },
              },
              {
                key: 'cerebrum.semantic.queryCacheTtl',
                label: 'Query Cache TTL (seconds)',
                type: 'number',
                default: '300',
                description: 'Time-to-live for cached query embeddings in Redis.',
                validation: {
                  min: 0,
                },
              },
              {
                key: 'cerebrum.hybrid.rrfK',
                label: 'RRF K Constant',
                type: 'number',
                default: '60',
                description: 'Reciprocal Rank Fusion K constant for merging results.',
                validation: {
                  min: 1,
                },
              },
              {
                key: 'cerebrum.hybrid.defaultLimit',
                label: 'Hybrid Default Limit',
                type: 'number',
                default: '20',
                description: 'Default number of results from hybrid search.',
                validation: {
                  min: 1,
                  max: 200,
                },
              },
              {
                key: 'cerebrum.hybrid.defaultThreshold',
                label: 'Hybrid Default Threshold',
                type: 'number',
                default: '0.8',
                description: 'Default distance threshold for hybrid search (0-1).',
                validation: {
                  min: 0,
                  max: 1,
                },
              },
              {
                key: 'cerebrum.context.tokenBudget',
                label: 'Context Assembly Token Budget',
                type: 'number',
                default: '4096',
                description: 'Default token budget for context assembly.',
                validation: {
                  min: 256,
                },
              },
            ],
          },
          {
            id: 'ingest',
            title: 'Ingest Pipeline',
            description:
              'Classifier, entity extractor, and scope inference settings. Model selection for each lives under AI Configuration → Per-Pipeline Model Overrides.',
            fields: [
              {
                key: 'cerebrum.classifier.confidenceThreshold',
                label: 'Classifier Confidence Threshold',
                type: 'number',
                default: '0.6',
                description: 'Minimum confidence to accept a classification (0-1).',
                validation: {
                  min: 0,
                  max: 1,
                },
              },
              {
                key: 'cerebrum.entityExtractor.confidenceThreshold',
                label: 'Entity Extractor Confidence Threshold',
                type: 'number',
                default: '0.7',
                description: 'Minimum confidence for extracted entities (0-1).',
                validation: {
                  min: 0,
                  max: 1,
                },
              },
            ],
          },
          {
            id: 'nudges',
            title: 'Nudges',
            description: 'Proactive nudge detection thresholds.',
            fields: [
              {
                key: 'cerebrum.nudge.consolidationSimilarity',
                label: 'Consolidation Similarity',
                type: 'number',
                default: '0.85',
                description: 'Minimum Thalamus similarity to propose consolidation.',
                validation: {
                  min: 0,
                  max: 1,
                },
              },
              {
                key: 'cerebrum.nudge.consolidationMinCluster',
                label: 'Consolidation Min Cluster',
                type: 'number',
                default: '3',
                validation: {
                  min: 2,
                },
              },
              {
                key: 'cerebrum.nudge.stalenessDays',
                label: 'Staleness Days',
                type: 'number',
                default: '90',
                description: 'Days since modification before an engram is flagged as stale.',
                validation: {
                  min: 1,
                },
              },
              {
                key: 'cerebrum.nudge.patternMinOccurrences',
                label: 'Pattern Min Occurrences',
                type: 'number',
                default: '5',
                validation: {
                  min: 2,
                },
              },
              {
                key: 'cerebrum.nudge.maxPending',
                label: 'Max Pending Nudges',
                type: 'number',
                default: '20',
                validation: {
                  min: 1,
                },
              },
              {
                key: 'cerebrum.nudge.cooldownHours',
                label: 'Nudge Cooldown Hours',
                type: 'number',
                default: '24',
                validation: {
                  min: 0,
                },
              },
            ],
          },
          {
            id: 'engrams',
            title: 'Engrams',
            fields: [
              {
                key: 'cerebrum.engram.fallbackScope',
                label: 'Fallback Scope',
                type: 'text',
                default: 'personal.captures',
                description: 'Default scope assigned when no rules or LLM inference match.',
              },
              {
                key: 'cerebrum.citation.excerptMaxLength',
                label: 'Citation Excerpt Max Length',
                type: 'number',
                default: '200',
                description: 'Maximum character length for citation excerpts.',
                validation: {
                  min: 50,
                },
              },
            ],
          },
          {
            id: 'plexus',
            title: 'Plexus (Adapter Lifecycle)',
            description: 'Health check interval, timeout, and failure thresholds.',
            fields: [
              {
                key: 'cerebrum.plexus.healthIntervalMs',
                label: 'Health Check Interval',
                type: 'duration',
                default: '300000',
              },
              {
                key: 'cerebrum.plexus.healthTimeoutMs',
                label: 'Health Check Timeout',
                type: 'number',
                default: '10000',
                description: 'Timeout for a single health check call (ms).',
                validation: {
                  min: 1000,
                },
              },
              {
                key: 'cerebrum.plexus.maxConsecutiveFailures',
                label: 'Max Consecutive Failures',
                type: 'number',
                default: '3',
                validation: {
                  min: 1,
                },
              },
            ],
          },
          {
            id: 'thalamus',
            title: 'Thalamus',
            fields: [
              {
                key: 'cerebrum.thalamus.crossSourceIntervalMs',
                label: 'Cross-Source Index Interval',
                type: 'duration',
                default: '21600000',
                description: 'Interval for the cross-source indexer job (ms). Default 6h.',
              },
            ],
          },
          {
            id: 'glia',
            title: 'Glia (Trust Graduation)',
            description: 'Graduation and demotion thresholds for the Glia trust system.',
            fields: [
              {
                key: 'cerebrum.glia.proposeMinApproved',
                label: 'Propose Min Approved',
                type: 'number',
                default: '20',
                validation: {
                  min: 1,
                },
              },
              {
                key: 'cerebrum.glia.proposeMaxRejectionRate',
                label: 'Propose Max Rejection Rate',
                type: 'number',
                default: '0.1',
                validation: {
                  min: 0,
                  max: 1,
                },
              },
              {
                key: 'cerebrum.glia.actReportMinDays',
                label: 'Act+Report Min Days',
                type: 'number',
                default: '60',
                validation: {
                  min: 1,
                },
              },
              {
                key: 'cerebrum.glia.demotionRevertThreshold',
                label: 'Demotion Revert Threshold',
                type: 'number',
                default: '2',
                validation: {
                  min: 1,
                },
              },
              {
                key: 'cerebrum.glia.demotionWindowDays',
                label: 'Demotion Window Days',
                type: 'number',
                default: '7',
                validation: {
                  min: 1,
                },
              },
            ],
          },
          {
            id: 'mcp',
            title: 'MCP Tools',
            description: 'Settings for Cerebrum MCP tool endpoints.',
            fields: [
              {
                key: 'cerebrum.mcp.queryMaxSources',
                label: 'MCP Query Max Sources',
                type: 'number',
                default: '3',
                validation: {
                  min: 1,
                  max: 50,
                },
              },
              {
                key: 'cerebrum.mcp.searchSnippetLength',
                label: 'MCP Search Snippet Length',
                type: 'number',
                default: '200',
                validation: {
                  min: 50,
                },
              },
              {
                key: 'cerebrum.mcp.searchDefaultLimit',
                label: 'MCP Search Default Limit',
                type: 'number',
                default: '20',
                validation: {
                  min: 1,
                  max: 100,
                },
              },
            ],
          },
        ],
      },
    ] satisfies readonly SettingsManifest[],
  },
  {
    id: 'core',
    name: 'Core',
    version: '0.1.0',
    surfaces: ['app'] as const,
    description:
      'Cross-cutting platform services: entities, AI usage/providers, settings, features, search.',
    hasBackend: false,
    hasFrontend: false,
    settings: [
      {
        id: 'ai.config',
        title: 'AI Configuration',
        icon: 'Bot',
        order: 200,
        groups: [
          {
            id: 'model',
            title: 'Model',
            fields: [
              {
                key: 'ai.model',
                label: 'AI Model',
                type: 'select',
                description:
                  'Default model for AI operations that do not specify their own. Per-pipeline overrides below still take precedence.',
                default: 'claude-haiku-4-5',
                options: [
                  {
                    value: 'claude-haiku-4-5',
                    label: 'Claude Haiku 4.5',
                  },
                  {
                    value: 'claude-sonnet-4-6',
                    label: 'Claude Sonnet 4.6',
                  },
                  {
                    value: 'claude-opus-4-7',
                    label: 'Claude Opus 4.7',
                  },
                ],
              },
            ],
          },
          {
            id: 'modelOverrides',
            title: 'Per-Pipeline Model Overrides',
            description:
              'Override the global AI Model on a per-pipeline basis. Leave empty to use the global model. Replaces the former cerebrum.*.model keys.',
            fields: [
              {
                key: 'ai.modelOverrides.query',
                label: 'Query (Q&A)',
                type: 'text',
                description: 'Model for the cerebrum Query Engine answer generation.',
              },
              {
                key: 'ai.modelOverrides.emit',
                label: 'Document Generation',
                type: 'text',
                description: 'Model for the cerebrum Emit document generation pipeline.',
              },
              {
                key: 'ai.modelOverrides.classifier',
                label: 'Content Classifier',
                type: 'text',
                description: 'Model for the cerebrum ingest content classifier.',
              },
              {
                key: 'ai.modelOverrides.entityExtractor',
                label: 'Entity Extractor',
                type: 'text',
                description: 'Model for the cerebrum ingest entity extractor.',
              },
              {
                key: 'ai.modelOverrides.scopeInference',
                label: 'Scope Inference',
                type: 'text',
                description: 'Model for the cerebrum ingest scope inferencer.',
              },
              {
                key: 'ai.modelOverrides.auditorContradiction',
                label: 'Contradiction Auditor',
                type: 'text',
                description: 'Model for the cerebrum auditor contradiction detector.',
              },
            ],
          },
          {
            id: 'budget',
            title: 'Budget',
            fields: [
              {
                key: 'ai.monthlyTokenBudget',
                label: 'Monthly Token Budget',
                type: 'number',
                description: 'Maximum tokens to use per month. Leave empty for no limit.',
                validation: {
                  min: 0,
                },
              },
              {
                key: 'ai.budgetExceededFallback',
                label: 'When Budget Exceeded',
                type: 'select',
                default: 'skip',
                options: [
                  {
                    value: 'skip',
                    label: 'Skip requests',
                  },
                  {
                    value: 'alert',
                    label: 'Alert and continue',
                  },
                ],
              },
            ],
          },
          {
            id: 'retention',
            title: 'Log Retention',
            fields: [
              {
                key: 'ai.logRetentionDays',
                label: 'Inference Log Retention (days)',
                type: 'number',
                description:
                  'How many days of raw `ai_inference_log` rows to keep. Older rows are aggregated into `ai_inference_daily` and removed by the nightly retention job.',
                default: '90',
                validation: {
                  min: 1,
                },
              },
            ],
          },
        ],
      },
      {
        id: 'core.operational',
        title: 'Core Operations',
        icon: 'Settings',
        order: 210,
        groups: [
          {
            id: 'corrections',
            title: 'Corrections',
            description: 'Thresholds for the transaction correction engine.',
            fields: [
              {
                key: 'core.corrections.highConfidenceThreshold',
                label: 'High Confidence Threshold',
                type: 'number',
                default: '0.9',
                description:
                  'Minimum confidence for a correction to be classified as "matched" (0–1).',
                validation: {
                  min: 0,
                  max: 1,
                },
              },
              {
                key: 'core.corrections.minPatternLength',
                label: 'Min Pattern Length',
                type: 'number',
                default: '3',
                description: 'Minimum characters for an AI-generated correction pattern.',
                validation: {
                  min: 1,
                  max: 50,
                },
              },
              {
                key: 'core.corrections.previewLimit',
                label: 'Preview Match Limit',
                type: 'number',
                default: '25',
                description: 'Default result limit for correction preview matches.',
                validation: {
                  min: 1,
                  max: 200,
                },
              },
              {
                key: 'core.corrections.previewHardLimit',
                label: 'Preview Hard Limit',
                type: 'number',
                default: '200',
                validation: {
                  min: 1,
                  max: 1000,
                },
              },
              {
                key: 'core.corrections.previewRulesFetchLimit',
                label: 'Preview Rules Fetch Limit',
                type: 'number',
                default: '50000',
                validation: {
                  min: 1000,
                },
              },
            ],
          },
          {
            id: 'coreSearch',
            title: 'Search',
            fields: [
              {
                key: 'core.search.showMoreLimit',
                label: 'Show More Limit',
                type: 'number',
                default: '5',
                description: 'Number of additional results shown when expanding search.',
                validation: {
                  min: 1,
                  max: 50,
                },
              },
            ],
          },
          {
            id: 'aiRetry',
            title: 'AI Rate Limit Retry',
            description: 'Exponential backoff settings for Anthropic API 429 retries.',
            fields: [
              {
                key: 'core.aiRetry.maxRetries',
                label: 'Max Retries',
                type: 'number',
                default: '5',
                validation: {
                  min: 0,
                  max: 20,
                },
              },
              {
                key: 'core.aiRetry.baseDelayMs',
                label: 'Base Delay (ms)',
                type: 'number',
                default: '1000',
                validation: {
                  min: 100,
                },
              },
            ],
          },
          {
            id: 'corePagination',
            title: 'Shared Pagination',
            fields: [
              {
                key: 'core.defaultLimit',
                label: 'Default Page Size',
                type: 'number',
                default: '50',
                description: 'Default page size for entities, corrections, and settings lists.',
                validation: {
                  min: 1,
                  max: 200,
                },
              },
            ],
          },
          {
            id: 'queueConfig',
            title: 'Job Queue',
            description: 'Concurrency and job retention for BullMQ queues.',
            fields: [
              {
                key: 'core.queue.syncConcurrency',
                label: 'Sync Concurrency',
                type: 'number',
                default: '1',
                validation: {
                  min: 1,
                  max: 10,
                },
              },
              {
                key: 'core.queue.embeddingsConcurrency',
                label: 'Embeddings Concurrency',
                type: 'number',
                default: '2',
                validation: {
                  min: 1,
                  max: 10,
                },
              },
              {
                key: 'core.queue.defaultConcurrency',
                label: 'Default Concurrency',
                type: 'number',
                default: '3',
                validation: {
                  min: 1,
                  max: 10,
                },
              },
              {
                key: 'core.queue.completedRetention',
                label: 'Completed Job Retention',
                type: 'number',
                default: '100',
                description: 'Number of completed jobs to keep per queue.',
                validation: {
                  min: 0,
                },
              },
            ],
          },
        ],
      },
    ] satisfies readonly SettingsManifest[],
  },
  {
    id: 'ego',
    name: 'Ego',
    version: '0.1.0',
    surfaces: ['app', 'overlay'] as const,
    description: 'Conversational AI interface to Cerebrum (PRD-087).',
    hasBackend: false,
    hasFrontend: true,
    overlay: { chromeSlot: 'assistant', shortcut: 'mod+i' },
    settings: [
      {
        id: 'ego',
        title: 'Ego (Conversational AI)',
        icon: 'MessageCircle',
        order: 310,
        groups: [
          {
            id: 'engine',
            title: 'Conversation Engine',
            description: 'Defaults for multi-turn conversation sessions.',
            fields: [
              {
                key: 'ego.defaultModel',
                label: 'Default Model',
                type: 'text',
                default: 'claude-sonnet-4-6',
                description: 'LLM model used for chat and context retrieval.',
              },
              {
                key: 'ego.maxHistory',
                label: 'Max History Messages',
                type: 'number',
                default: '20',
                description: 'Maximum conversation messages to include in context.',
                validation: {
                  min: 1,
                  max: 200,
                },
              },
              {
                key: 'ego.maxRetrieval',
                label: 'Max Retrieval Results',
                type: 'number',
                default: '5',
                description: 'Maximum engram retrieval results per turn.',
                validation: {
                  min: 1,
                  max: 50,
                },
              },
              {
                key: 'ego.tokenBudget',
                label: 'Token Budget',
                type: 'number',
                default: '4096',
                description: 'Token budget for the assembled retrieval context.',
                validation: {
                  min: 256,
                },
              },
              {
                key: 'ego.relevanceThreshold',
                label: 'Relevance Threshold',
                type: 'number',
                default: '0.3',
                description: 'Minimum relevance score for retrieval results (0–1).',
                validation: {
                  min: 0,
                  max: 1,
                },
              },
            ],
          },
          {
            id: 'llm',
            title: 'LLM Parameters',
            description: 'Token limits and temperature for chat and summary calls.',
            fields: [
              {
                key: 'ego.chat.maxTokens',
                label: 'Chat Max Tokens',
                type: 'number',
                default: '2048',
                description: 'Maximum output tokens for chat responses.',
                validation: {
                  min: 64,
                },
              },
              {
                key: 'ego.chat.temperature',
                label: 'Chat Temperature',
                type: 'number',
                default: '0.3',
                description: 'Sampling temperature for chat responses (0–1).',
                validation: {
                  min: 0,
                  max: 1,
                },
              },
              {
                key: 'ego.summary.maxTokens',
                label: 'Summary Max Tokens',
                type: 'number',
                default: '512',
                description: 'Maximum output tokens for history summarisation.',
                validation: {
                  min: 64,
                },
              },
              {
                key: 'ego.summary.temperature',
                label: 'Summary Temperature',
                type: 'number',
                default: '0',
                description: 'Sampling temperature for history summarisation (0–1).',
                validation: {
                  min: 0,
                  max: 1,
                },
              },
            ],
          },
        ],
      },
    ] satisfies readonly SettingsManifest[],
  },
  {
    id: 'finance',
    name: 'Finance',
    version: '0.1.0',
    surfaces: ['app'] as const,
    description: 'Transactions, budgets, entities, and import pipeline.',
    hasBackend: false,
    hasFrontend: false,
    settings: [
      {
        id: 'finance',
        title: 'Finance',
        icon: 'DollarSign',
        order: 140,
        groups: [
          {
            id: 'aiCategorizer',
            title: 'AI Categorizer',
            description: 'Model and limits for AI-powered transaction categorisation.',
            fields: [
              {
                key: 'finance.aiCategorizer.model',
                label: 'Categorizer Model',
                type: 'text',
                default: 'claude-haiku-4-5-20251001',
                description: 'LLM model used for entity matching.',
              },
              {
                key: 'finance.aiCategorizer.maxTokens',
                label: 'Max Tokens',
                type: 'number',
                default: '200',
                description: 'Maximum output tokens per categorisation call.',
                validation: {
                  min: 50,
                  max: 2000,
                },
              },
              {
                key: 'finance.ruleGen.model',
                label: 'Rule Generation Model',
                type: 'text',
                default: 'claude-haiku-4-5-20251001',
                description: 'LLM model for correction rule analysis.',
              },
              {
                key: 'finance.ruleGen.maxTokens',
                label: 'Rule Gen Max Tokens',
                type: 'number',
                default: '200',
                validation: {
                  min: 50,
                  max: 2000,
                },
              },
            ],
          },
          {
            id: 'financePagination',
            title: 'Pagination',
            description: 'Default page sizes for finance list endpoints.',
            fields: [
              {
                key: 'finance.defaultLimit',
                label: 'Default Page Size',
                type: 'number',
                default: '50',
                description: 'Default page size for transactions, budgets, and wishlist.',
                validation: {
                  min: 1,
                  max: 200,
                },
              },
            ],
          },
        ],
      },
    ] satisfies readonly SettingsManifest[],
  },
  {
    id: 'inventory',
    name: 'Inventory',
    version: '0.1.0',
    surfaces: ['app'] as const,
    description: 'Home items, locations, connections, warranties, and documents.',
    hasBackend: false,
    hasFrontend: false,
    settings: [
      {
        id: 'inventory',
        title: 'Inventory',
        icon: 'Package',
        order: 150,
        groups: [
          {
            id: 'inventoryPagination',
            title: 'Pagination',
            description: 'Default page sizes for inventory list endpoints.',
            fields: [
              {
                key: 'inventory.defaultLimit',
                label: 'Default Page Size',
                type: 'number',
                default: '50',
                description: 'Default page size for items, connections, documents, and photos.',
                validation: {
                  min: 1,
                  max: 200,
                },
              },
              {
                key: 'inventory.searchDefaultLimit',
                label: 'Search Default Limit',
                type: 'number',
                default: '20',
                description: 'Default result limit for inventory search.',
                validation: {
                  min: 1,
                  max: 100,
                },
              },
            ],
          },
          {
            id: 'documentFiles',
            title: 'Document Files',
            description: 'Upload constraints for inventory document attachments.',
            fields: [
              {
                key: 'inventory.maxFileSizeBytes',
                label: 'Max File Size (bytes)',
                type: 'number',
                default: '10485760',
                description: 'Maximum upload file size in bytes (default 10 MB).',
                validation: {
                  min: 1048576,
                },
              },
            ],
          },
        ],
      },
    ] satisfies readonly SettingsManifest[],
  },
  {
    id: 'media',
    name: 'Media',
    version: '0.1.0',
    surfaces: ['app'] as const,
    description: 'Movies, TV shows, watch history, and Plex/TMDB/TVDB sync.',
    hasBackend: false,
    hasFrontend: false,
    settings: [
      {
        id: 'media.plex',
        title: 'Plex',
        icon: 'Film',
        order: 100,
        groups: [
          {
            id: 'connection',
            title: 'Connection',
            fields: [
              {
                key: 'plex_url',
                label: 'Plex URL',
                type: 'url',
              },
              {
                key: 'plex_token',
                label: 'Plex Token',
                type: 'password',
                sensitive: true,
                testAction: {
                  procedure: 'media.plex.testConnection',
                  label: 'Test Connection',
                },
              },
            ],
          },
          {
            id: 'library',
            title: 'Library',
            description: 'Enter the Plex library section IDs to sync.',
            fields: [
              {
                key: 'plex_movie_section_id',
                label: 'Movie Library Section',
                type: 'text',
                description: 'Enter the Plex movie library section ID.',
              },
              {
                key: 'plex_tv_section_id',
                label: 'TV Library Section',
                type: 'text',
                description: 'Enter the Plex TV library section ID.',
              },
            ],
          },
          {
            id: 'sync',
            title: 'Sync',
            fields: [
              {
                key: 'plex_scheduler_enabled',
                label: 'Auto Sync',
                type: 'toggle',
              },
              {
                key: 'plex_scheduler_interval_ms',
                label: 'Sync Interval',
                type: 'duration',
                description: 'How often to sync the Plex library.',
              },
            ],
          },
        ],
      },
      {
        id: 'media.arr',
        title: 'Arr',
        icon: 'Download',
        order: 110,
        groups: [
          {
            id: 'radarr',
            title: 'Radarr',
            description: 'Movie download management.',
            fields: [
              {
                key: 'radarr_url',
                label: 'Radarr URL',
                type: 'url',
              },
              {
                key: 'radarr_api_key',
                label: 'Radarr API Key',
                type: 'password',
                sensitive: true,
                testAction: {
                  procedure: 'media.arr.testRadarrSaved',
                  label: 'Test Radarr',
                },
              },
            ],
          },
          {
            id: 'sonarr',
            title: 'Sonarr',
            description: 'TV show download management.',
            fields: [
              {
                key: 'sonarr_url',
                label: 'Sonarr URL',
                type: 'url',
              },
              {
                key: 'sonarr_api_key',
                label: 'Sonarr API Key',
                type: 'password',
                sensitive: true,
                testAction: {
                  procedure: 'media.arr.testSonarrSaved',
                  label: 'Test Sonarr',
                },
              },
            ],
          },
        ],
      },
      {
        id: 'media.rotation',
        title: 'Rotation',
        icon: 'Shuffle',
        order: 120,
        groups: [
          {
            id: 'schedule',
            title: 'Schedule',
            fields: [
              {
                key: 'rotation_enabled',
                label: 'Enable Rotation',
                type: 'toggle',
              },
              {
                key: 'rotation_cron_expression',
                label: 'Cron Schedule',
                type: 'text',
                default: '0 3 * * *',
                description:
                  'Cron expression for when rotation runs (e.g. "0 3 * * *" = daily at 3 AM).',
              },
            ],
          },
          {
            id: 'capacity',
            title: 'Capacity',
            fields: [
              {
                key: 'rotation_target_free_gb',
                label: 'Target Free Space (GB)',
                type: 'number',
                default: '100',
                validation: {
                  min: 0,
                },
              },
              {
                key: 'rotation_avg_movie_gb',
                label: 'Average Movie Size (GB)',
                type: 'number',
                default: '15',
                validation: {
                  min: 1,
                },
              },
            ],
          },
          {
            id: 'protection',
            title: 'Protection',
            fields: [
              {
                key: 'rotation_protected_days',
                label: 'Protected Days',
                type: 'number',
                default: '30',
                description: 'Movies added within this many days are protected from rotation.',
                validation: {
                  min: 0,
                },
              },
              {
                key: 'rotation_daily_additions',
                label: 'Daily Additions Limit',
                type: 'number',
                default: '2',
                validation: {
                  min: 1,
                },
              },
              {
                key: 'rotation_leaving_days',
                label: 'Leaving Days',
                type: 'number',
                default: '7',
                description: 'How many days a movie is marked as "leaving" before removal.',
                validation: {
                  min: 1,
                },
              },
            ],
          },
        ],
      },
      {
        id: 'media.operational',
        title: 'Media Operations',
        icon: 'Clapperboard',
        order: 130,
        groups: [
          {
            id: 'elo',
            title: 'ELO Rating',
            description: 'Parameters for the comparison arena scoring algorithm.',
            fields: [
              {
                key: 'media.comparisons.eloK',
                label: 'K-Factor',
                type: 'number',
                default: '32',
                description: 'ELO K-factor controlling how much each comparison shifts scores.',
                validation: {
                  min: 1,
                  max: 128,
                },
              },
              {
                key: 'media.comparisons.defaultScore',
                label: 'Default Score',
                type: 'number',
                default: '1500',
                description: 'Starting ELO score for newly added movies.',
                validation: {
                  min: 100,
                },
              },
            ],
          },
          {
            id: 'tierList',
            title: 'Tier Lists',
            description: 'Tier-list selection and staleness thresholds.',
            fields: [
              {
                key: 'media.comparisons.maxTierListMovies',
                label: 'Max Tier List Movies',
                type: 'number',
                default: '8',
                description: 'Maximum movies per tier-list round.',
                validation: {
                  min: 2,
                  max: 20,
                },
              },
              {
                key: 'media.comparisons.stalenessThreshold',
                label: 'Staleness Threshold',
                type: 'number',
                default: '0.3',
                description: 'Minimum staleness score (0–1) for tier list eligibility.',
                validation: {
                  min: 0,
                  max: 1,
                },
              },
            ],
          },
          {
            id: 'comparisonsPagination',
            title: 'Comparisons Pagination',
            fields: [
              {
                key: 'media.comparisons.defaultLimit',
                label: 'Default Page Size',
                type: 'number',
                default: '50',
                validation: {
                  min: 1,
                  max: 200,
                },
              },
            ],
          },
          {
            id: 'discoverySession',
            title: 'Discover Sessions',
            description: 'Session assembly size and variety constraints.',
            fields: [
              {
                key: 'media.discovery.sessionTargetMin',
                label: 'Session Min Shelves',
                type: 'number',
                default: '10',
                validation: {
                  min: 1,
                  max: 50,
                },
              },
              {
                key: 'media.discovery.sessionTargetMax',
                label: 'Session Max Shelves',
                type: 'number',
                default: '15',
                validation: {
                  min: 1,
                  max: 50,
                },
              },
              {
                key: 'media.discovery.maxSeedShelves',
                label: 'Max Seed Shelves',
                type: 'number',
                default: '3',
                validation: {
                  min: 1,
                  max: 20,
                },
              },
              {
                key: 'media.discovery.maxGenreShelves',
                label: 'Max Genre Shelves',
                type: 'number',
                default: '2',
                validation: {
                  min: 1,
                  max: 20,
                },
              },
              {
                key: 'media.discovery.maxActiveCollections',
                label: 'Max Active Context Collections',
                type: 'number',
                default: '2',
                description: 'Max time-triggered context collections per session.',
                validation: {
                  min: 1,
                  max: 10,
                },
              },
            ],
          },
          {
            id: 'discoveryShelves',
            title: 'Shelf Limits',
            description: 'Per-shelf seed and result caps.',
            fields: [
              {
                key: 'media.discovery.maxBecauseYouWatchedSeeds',
                label: '"Because You Watched" Max Seeds',
                type: 'number',
                default: '10',
                validation: {
                  min: 1,
                  max: 50,
                },
              },
              {
                key: 'media.discovery.maxCreditsSeeds',
                label: 'Credits Shelf Max Seeds',
                type: 'number',
                default: '10',
                validation: {
                  min: 1,
                  max: 50,
                },
              },
              {
                key: 'media.discovery.maxBestInGenre',
                label: 'Best in Genre Max Results',
                type: 'number',
                default: '5',
                validation: {
                  min: 1,
                  max: 20,
                },
              },
              {
                key: 'media.discovery.maxCrossoverPairs',
                label: 'Genre Crossover Max Pairs',
                type: 'number',
                default: '6',
                validation: {
                  min: 1,
                  max: 20,
                },
              },
            ],
          },
          {
            id: 'thetvdb',
            title: 'TheTVDB',
            description: 'Rate limiter and retry settings for TheTVDB API.',
            fields: [
              {
                key: 'media.thetvdb.rateLimitCapacity',
                label: 'Rate Limit Bucket Capacity',
                type: 'number',
                default: '20',
                validation: {
                  min: 1,
                },
              },
              {
                key: 'media.thetvdb.rateLimitRefillRate',
                label: 'Rate Limit Refill Rate (tokens/sec)',
                type: 'number',
                default: '2',
                validation: {
                  min: 1,
                },
              },
              {
                key: 'media.thetvdb.maxRetries',
                label: 'Max Retries',
                type: 'number',
                default: '3',
                validation: {
                  min: 0,
                  max: 10,
                },
              },
            ],
          },
          {
            id: 'tmdb',
            title: 'TMDB',
            description: 'TMDB genre cache and image download settings.',
            fields: [
              {
                key: 'media.tmdb.genreCacheTtlMs',
                label: 'Genre Cache TTL (ms)',
                type: 'duration',
                default: '86400000',
                description: 'How long to cache TMDB genre lists (default 24h).',
              },
              {
                key: 'media.tmdb.imageMaxRetries',
                label: 'Image Download Max Retries',
                type: 'number',
                default: '2',
                validation: {
                  min: 0,
                  max: 10,
                },
              },
              {
                key: 'media.tmdb.imageRetryDelayMs',
                label: 'Image Retry Delay (ms)',
                type: 'number',
                default: '500',
                validation: {
                  min: 100,
                },
              },
            ],
          },
          {
            id: 'plexSync',
            title: 'Plex Sync',
            description: 'Plex discover sync and watchlist settings.',
            fields: [
              {
                key: 'media.plex.rateLimitDelayMs',
                label: 'Discover Rate Limit Delay (ms)',
                type: 'number',
                default: '200',
                description: 'Delay between Plex Discover API calls during sync.',
                validation: {
                  min: 0,
                },
              },
              {
                key: 'media.plex.clientPageSize',
                label: 'Library Page Size',
                type: 'number',
                default: '100',
                description: 'Page size when fetching Plex library sections.',
                validation: {
                  min: 10,
                  max: 500,
                },
              },
              {
                key: 'media.plex.friendsPageSize',
                label: 'Friends Watchlist Page Size',
                type: 'number',
                default: '50',
                validation: {
                  min: 10,
                  max: 200,
                },
              },
            ],
          },
          {
            id: 'mediaPagination',
            title: 'Media Pagination',
            description: 'Default page sizes for media list endpoints.',
            fields: [
              {
                key: 'media.defaultLimit',
                label: 'Default Page Size',
                type: 'number',
                default: '50',
                description:
                  'Default page size for movies, TV shows, watchlist, and watch history.',
                validation: {
                  min: 1,
                  max: 200,
                },
              },
            ],
          },
          {
            id: 'tmdbTopRated',
            title: 'TMDB Top Rated Source',
            description: 'Settings for the TMDB top-rated rotation source.',
            fields: [
              {
                key: 'media.rotation.tmdbDefaultPages',
                label: 'Default Pages',
                type: 'number',
                default: '5',
                validation: {
                  min: 1,
                  max: 25,
                },
              },
              {
                key: 'media.rotation.tmdbMaxPages',
                label: 'Max Pages',
                type: 'number',
                default: '25',
                validation: {
                  min: 1,
                  max: 100,
                },
              },
              {
                key: 'media.rotation.tmdbMinVoteCount',
                label: 'Min Vote Count',
                type: 'number',
                default: '500',
                description: 'Minimum TMDB vote count for top-rated eligibility.',
                validation: {
                  min: 0,
                },
              },
              {
                key: 'media.rotation.letterboxdMaxPages',
                label: 'Letterboxd Max Pages',
                type: 'number',
                default: '20',
                validation: {
                  min: 1,
                  max: 100,
                },
              },
            ],
          },
        ],
      },
    ] satisfies readonly SettingsManifest[],
  },
] as const;

export type GeneratedModuleId =
  | 'ai'
  | 'cerebrum'
  | 'core'
  | 'ego'
  | 'finance'
  | 'inventory'
  | 'media';
