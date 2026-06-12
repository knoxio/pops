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
 *
 * The remaining slices (embeddings, conversations, plexus) follow in
 * subsequent PRs. Cerebrum's load-bearing surgery is the URI
 * dispatcher round-trip (engrams reference other pillars' entities by
 * URI) — that lands when the consumers cut over, not in this scaffold.
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
