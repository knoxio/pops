/**
 * Public types for the Glia / Curation dashboard (PRD-085, PRD-086).
 */

export const GLIA_ACTION_TYPES = ['prune', 'consolidate', 'link', 'audit'] as const;
export type GliaActionType = (typeof GLIA_ACTION_TYPES)[number];

export const GLIA_ACTION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'executed',
  'reverted',
] as const;
export type GliaActionStatus = (typeof GLIA_ACTION_STATUSES)[number];

export const GLIA_TRUST_PHASES = ['propose', 'act_report', 'silent'] as const;
export type GliaTrustPhase = (typeof GLIA_TRUST_PHASES)[number];

export interface GliaAction {
  id: string;
  actionType: GliaActionType;
  affectedIds: string[];
  rationale: string;
  payload?: unknown;
  phase: GliaTrustPhase;
  status: GliaActionStatus;
  userDecision: 'approve' | 'reject' | 'modify' | null;
  userNote: string | null;
  executedAt: string | null;
  decidedAt: string | null;
  revertedAt: string | null;
  createdAt: string;
}

export interface GliaTrustState {
  actionType: GliaActionType;
  currentPhase: GliaTrustPhase;
  approvedCount: number;
  rejectedCount: number;
  revertedCount: number;
  autonomousSince: string | null;
  lastRevertAt: string | null;
  graduatedAt: string | null;
  updatedAt: string;
}

export type GliaWorkerKey = 'pruner' | 'consolidator' | 'linker' | 'auditor';
