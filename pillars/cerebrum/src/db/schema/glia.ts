/**
 * Glia trust graduation schema.
 *
 * Tracks every Glia action (proposals, approvals, rejections, executions,
 * reverts) and per-action-type trust state that drives the three-phase
 * graduation model (propose → act_report → silent).
 *
 * See ADR-021 and PRD-086 for the full spec.
 */
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const gliaActions = sqliteTable(
  'glia_actions',
  {
    /** Action ID: `glia_{type}_{timestamp}_{hash}` */
    id: text('id').primaryKey(),
    /** One of: prune, consolidate, link, audit */
    actionType: text('action_type').notNull(),
    /** JSON array of engram IDs affected by this action */
    affectedIds: text('affected_ids').notNull(),
    /** Human-readable explanation of why this action was proposed */
    rationale: text('rationale').notNull(),
    /** JSON — action-type-specific data (merge plan, link pairs, etc) */
    payload: text('payload'),
    /** Trust phase at creation: propose, act_report, silent */
    phase: text('phase').notNull(),
    /** pending, approved, rejected, executed, reverted */
    status: text('status').notNull(),
    /** approve, reject, modify — null for autonomous actions */
    userDecision: text('user_decision'),
    /** Optional user comment on approval/rejection */
    userNote: text('user_note'),
    /** ISO 8601 — when the action was executed (null if pending) */
    executedAt: text('executed_at'),
    /** ISO 8601 — when user approved/rejected (null for autonomous) */
    decidedAt: text('decided_at'),
    /** ISO 8601 — when the action was reverted (null if not reverted) */
    revertedAt: text('reverted_at'),
    /** ISO 8601 — when the action was created */
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_glia_actions_action_type').on(table.actionType),
    index('idx_glia_actions_status').on(table.status),
    index('idx_glia_actions_phase').on(table.phase),
    index('idx_glia_actions_created_at').on(table.createdAt),
  ]
);

export const gliaTrustState = sqliteTable('glia_trust_state', {
  /** One of: prune, consolidate, link, audit */
  actionType: text('action_type').primaryKey(),
  /** Current trust phase: propose, act_report, silent */
  currentPhase: text('current_phase').notNull(),
  /** Total approved actions for this type */
  approvedCount: integer('approved_count').notNull().default(0),
  /** Total rejected actions for this type */
  rejectedCount: integer('rejected_count').notNull().default(0),
  /** Total reverted actions for this type */
  revertedCount: integer('reverted_count').notNull().default(0),
  /** ISO 8601 — when this type graduated to act_report */
  autonomousSince: text('autonomous_since'),
  /** ISO 8601 — timestamp of most recent revert */
  lastRevertAt: text('last_revert_at'),
  /** ISO 8601 — when last phase transition occurred */
  graduatedAt: text('graduated_at'),
  /** ISO 8601 — last update */
  updatedAt: text('updated_at').notNull(),
});
