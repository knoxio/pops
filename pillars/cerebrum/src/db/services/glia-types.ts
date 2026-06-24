/**
 * Glia public shapes returned from the data-access layer.
 *
 * Consumers build action / trust-state views from these instead of
 * re-deriving them from drizzle row shapes.
 */

/** The four Glia action types (ADR-021). */
export const ACTION_TYPES = ['prune', 'consolidate', 'link', 'audit'] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** Trust phases in graduation order (ADR-021). */
export const TRUST_PHASES = ['propose', 'act_report', 'silent'] as const;
export type TrustPhase = (typeof TRUST_PHASES)[number];

/** Action lifecycle statuses. */
export const ACTION_STATUSES = ['pending', 'approved', 'rejected', 'executed', 'reverted'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

/** User decisions on a pending proposal. */
export const USER_DECISIONS = ['approve', 'reject', 'modify'] as const;
export type UserDecision = (typeof USER_DECISIONS)[number];

/** A Glia action record — one row from `glia_actions` deserialised. */
export interface GliaAction {
  id: string;
  actionType: ActionType;
  affectedIds: string[];
  rationale: string;
  payload: unknown | null;
  phase: TrustPhase;
  status: ActionStatus;
  userDecision: UserDecision | null;
  userNote: string | null;
  executedAt: string | null;
  decidedAt: string | null;
  revertedAt: string | null;
  createdAt: string;
}

/** Trust state for a single action type — one row from `glia_trust_state`. */
export interface GliaTrustState {
  actionType: ActionType;
  currentPhase: TrustPhase;
  approvedCount: number;
  rejectedCount: number;
  revertedCount: number;
  autonomousSince: string | null;
  lastRevertAt: string | null;
  graduatedAt: string | null;
  updatedAt: string;
}

/** Filters for `listActions`. */
export interface ActionListFilters {
  actionType?: ActionType;
  status?: ActionStatus;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

/** Result envelope from `listActions` — kept symmetrical with `nudge-log`. */
export interface ListActionsResult {
  actions: GliaAction[];
  total: number;
}

/**
 * Insert payload for `insertAction` — the data-access layer's contract for
 * creating a new glia_actions row. The caller is responsible for ID
 * generation, phase resolution, autonomous-vs-pending status branching, and
 * any trust-state updates. This keeps the service decoupled from the trust
 * machine.
 */
export interface InsertActionRow {
  id: string;
  actionType: ActionType;
  affectedIds: readonly string[];
  rationale: string;
  payload: unknown | null;
  phase: TrustPhase;
  status: ActionStatus;
  executedAt: string | null;
  createdAt: string;
}

/** Patch payload for `updateAction` — only the lifecycle-mutable columns. */
export interface UpdateActionPatch {
  status?: ActionStatus;
  userDecision?: UserDecision | null;
  userNote?: string | null;
  executedAt?: string | null;
  decidedAt?: string | null;
  revertedAt?: string | null;
}

/** Seed payload for `seedTrustState` — used to bootstrap a missing row. */
export interface SeedTrustStateRow {
  actionType: ActionType;
  currentPhase: TrustPhase;
  approvedCount: number;
  rejectedCount: number;
  revertedCount: number;
  updatedAt: string;
}

/** Patch payload for `updateTrustState` — every field optional. */
export interface UpdateTrustStatePatch {
  currentPhase?: TrustPhase;
  approvedCount?: number;
  rejectedCount?: number;
  revertedCount?: number;
  autonomousSince?: string | null;
  lastRevertAt?: string | null;
  graduatedAt?: string | null;
  updatedAt: string;
}
