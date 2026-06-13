/**
 * Backend-safe barrel for the cerebrum domain's persistence layer.
 *
 * Hosts cerebrum pillar tables: engram_index + engram_scopes + engram_tags
 * + engram_links (knowledge graph), embeddings + embeddings_vec (dense
 * vector store), conversations + messages + conversation_context (ego),
 * nudge_log (reflex audit), glia_actions + glia_trust_state (glia worker
 * audit), plexus_adapters + plexus_filters (external adapter registry).
 *
 * Per the CI-never-breaks pattern the migration is incremental:
 *   - Track M5 (PRD-149) moved the `nudge_log` slice (PRD-084 reflex
 *     audit) into this package and routed pops-api through the
 *     `nudgeLogService` exports.
 *   - PRD-179 US-01 added the engrams data layer — schemas, baseline
 *     migration, sqlite-vec wiring, and the `engramsService`
 *     namespace. Pops-api still owns engram routing and consumes the
 *     legacy shared handle via `getDrizzle()`; PRD-179 US-03 flips it
 *     over to `getCerebrumDrizzle()`.
 *   - PRD-181 US-01 added the glia data layer — schemas, baseline
 *     migration, and the `gliaService` namespace covering CRUD on
 *     `glia_actions` and the per-action-type trust state. Trust
 *     graduation, dispatch and digest rendering stay in pops-api until
 *     PRD-181 US-03.
 *   - PRD-182 US-01 added the conversations data layer — schemas,
 *     baseline migration, and the `conversationsService` namespace
 *     covering CRUD on `conversations`, append/list on `messages`, and
 *     upsert/list on the `conversation_context` junction table. The
 *     chat orchestration (streaming, model selection, auto-titling)
 *     stays in pops-api until PRD-182 PR 3.
 *   - PRD-180 US-01 added the plexus data layer — schemas, baseline
 *     migration, and the `plexusService` namespace covering adapter
 *     CRUD on `plexus_adapters` and the per-adapter filter set. TOML
 *     config loading, the per-adapter HTTP clients, the lifecycle
 *     orchestrator and the encrypted-config envelope all stay in
 *     pops-api until PRD-180 US-03.
 *   - Theme-13 wave-5 added the embeddings slice — schema re-export,
 *     baseline migration (`0054_embeddings_baseline.sql`), and the
 *     `embeddings` table copied into the backfill bridge. The hot-path
 *     handlers in `apps/pops-api/src/jobs/handlers/embeddings-source.ts`
 *     and `embeddings-helpers.ts` migrate over to `getCerebrumDrizzle()`
 *     in the next PR.
 *
 * Cerebrum's load-bearing surgery is the URI dispatcher round-trip
 * (engrams reference other pillars' entities by URI) — that lands when
 * the consumers cut over, not in this scaffold.
 *
 * Subsequent PRs flesh out three sibling packages — `cerebrum-contract`,
 * `cerebrum-api`, `cerebrum-ui` — which are deferred until their first
 * content lands rather than scaffolded empty.
 */
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
