/**
 * Backend-safe barrel for the cerebrum pillar's persistence layer.
 *
 * Hosts the cerebrum-owned tables: engram_index + engram_scopes +
 * engram_tags + engram_links (knowledge graph), embeddings +
 * embeddings_vec (dense vector store), conversations + messages +
 * conversation_context (ego), nudge_log (reflex audit), glia_actions +
 * glia_trust_state (glia worker audit), plexus_adapters + plexus_filters
 * (external adapter registry), debrief sessions/results/status,
 * reflex_executions, and settings.
 *
 * Engrams reference other pillars' entities by URI; those soft pointers
 * are resolved cross-pillar via the URI dispatcher (ADR-026) rather than
 * by joining foreign tables here.
 */
export * from './row-types.js';
export * from './schema.js';

export type { CerebrumDb } from './services/internal.js';

export {
  openCerebrumDb,
  type OpenCerebrumDbOptions,
  type OpenedCerebrumDb,
} from './open-cerebrum-db.js';

export {
  ensureEmbeddingsVecTable,
  isVecAvailable,
  tryLoadVecExtension,
  type VecLoaderLogger,
} from './vec-loader.js';

export * as nudgeLogService from './services/nudge-log.js';
export * as engramsService from './services/engrams.js';
export * as gliaService from './services/glia.js';
export * as conversationsService from './services/conversations.js';
export * as plexusService from './services/plexus.js';

export type {
  Nudge,
  NudgeAction,
  NudgeActionType,
  NudgeCandidate,
  NudgePersistenceThresholds,
  NudgePriority,
  NudgeStatus,
  NudgeType,
} from './services/nudge-log-types.js';

export { generateNudgeId, rowToNudge, type NudgeLogRow } from './services/nudge-log-helpers.js';

export type {
  Engram,
  EngramSource,
  EngramStatus,
  EngramSummary,
  IndexRow as EngramIndexRow,
  ListEngramsOptions,
  ListEngramsResult,
  UpsertEngramArgs,
} from './services/engrams-types.js';

export {
  ACTION_STATUSES,
  ACTION_TYPES,
  TRUST_PHASES,
  USER_DECISIONS,
  type ActionListFilters,
  type ActionStatus,
  type ActionType,
  type GliaAction,
  type GliaTrustState,
  type InsertActionRow,
  type ListActionsResult,
  type SeedTrustStateRow,
  type TrustPhase,
  type UpdateActionPatch,
  type UpdateTrustStatePatch,
  type UserDecision,
} from './services/glia-types.js';

export {
  MESSAGE_ROLES,
  type Conversation,
  type ConversationContextEntry,
  type ConversationListFilters,
  type InsertConversationRow,
  type InsertMessageRow,
  type ListConversationsResult,
  type Message,
  type MessageRole,
  type UpdateConversationPatch,
  type UpsertContextRow,
} from './services/conversations-types.js';

export {
  ConversationConflictError,
  ConversationNotFoundError,
  MessageConflictError,
  MessageNotFoundError,
} from './services/conversations-errors.js';

export {
  PLEXUS_ADAPTER_STATUSES,
  PLEXUS_FILTER_TYPES,
  type PlexusAdapter,
  type PlexusAdapterRow,
  type PlexusAdapterStatus,
  type PlexusFilter,
  type PlexusFilterDefinition,
  type PlexusFilterRow,
  type PlexusFilterType,
  type UpsertAdapterArgs,
} from './services/plexus-types.js';

export {
  rowToAdapter as plexusRowToAdapter,
  rowToFilter as plexusRowToFilter,
  parseAdapterConfig as plexusParseAdapterConfig,
} from './services/plexus-helpers.js';

export {
  PlexusAdapterNameConflictError,
  PlexusAdapterNotFoundError,
} from './services/plexus-errors.js';
