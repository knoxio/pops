/**
 * Backend-safe barrel for the cerebrum domain's persistence layer.
 *
 * Hosts cerebrum pillar tables: engram_index + engram_scopes + engram_tags
 * (knowledge graph), embeddings + embeddings_vec (dense vector store),
 * conversations + messages + conversation_context (ego), nudge_log
 * (reflex audit), glia_actions + glia_trust_state (glia worker audit),
 * plexus_adapters + plexus_filters (external adapter registry).
 *
 * Per the CI-never-breaks pattern the migration is incremental — this PR
 * scaffolds the package and moves only the `nudge_log` slice (PRD-084
 * reflex audit). The other slices (engrams, embeddings, conversations,
 * glia, plexus) follow in subsequent PRs. Cerebrum's load-bearing
 * surgery is the URI dispatcher round-trip (engrams reference other
 * pillars' entities by URI) — that lands when the engrams slice moves.
 *
 * Subsequent PRs flesh out three sibling packages — `cerebrum-contract`,
 * `cerebrum-api`, `cerebrum-ui` — which are deferred until their first
 * content lands rather than scaffolded empty.
 */
export * from './schema.js';

export type { CerebrumDb } from './services/internal.js';

export * as nudgeLogService from './services/nudge-log.js';

// Public types re-exported at the package root so consumers can name
// them without reaching into the namespaces.
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
