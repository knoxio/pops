/**
 * Glia row serialisation helpers.
 *
 * Extracted so the SQL seam in `glia.ts` stays focused on queries and so
 * tests can exercise the deserialisation logic in isolation.
 */
import type { gliaActions, gliaTrustState } from '../schema.js';
import type {
  ActionStatus,
  ActionType,
  GliaAction,
  GliaTrustState,
  TrustPhase,
  UserDecision,
} from './glia-types.js';

/** Deserialise a row from `glia_actions` into a `GliaAction`. */
export function rowToGliaAction(row: typeof gliaActions.$inferSelect): GliaAction {
  return {
    id: row.id,
    actionType: row.actionType as ActionType,
    affectedIds: JSON.parse(row.affectedIds) as string[],
    rationale: row.rationale,
    payload: row.payload != null ? (JSON.parse(row.payload) as unknown) : null,
    phase: row.phase as TrustPhase,
    status: row.status as ActionStatus,
    userDecision: row.userDecision as UserDecision | null,
    userNote: row.userNote,
    executedAt: row.executedAt,
    decidedAt: row.decidedAt,
    revertedAt: row.revertedAt,
    createdAt: row.createdAt,
  };
}

/** Deserialise a row from `glia_trust_state` into a `GliaTrustState`. */
export function rowToGliaTrustState(row: typeof gliaTrustState.$inferSelect): GliaTrustState {
  return {
    actionType: row.actionType as ActionType,
    currentPhase: row.currentPhase as TrustPhase,
    approvedCount: row.approvedCount,
    rejectedCount: row.rejectedCount,
    revertedCount: row.revertedCount,
    autonomousSince: row.autonomousSince,
    lastRevertAt: row.lastRevertAt,
    graduatedAt: row.graduatedAt,
    updatedAt: row.updatedAt,
  };
}
