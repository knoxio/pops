/**
 * Autonomous-action digest builder (#2577 — PRD-086 US-04 AC #5/#6).
 *
 * Pure functions: takes a pre-filtered list of autonomous `glia_actions`
 * rows plus per-action-type post-graduation counts, groups by action type,
 * and flags anomalies on high rejection rates.
 *
 * Split out from `digest-reports.ts` to keep that file under the
 * `max-lines` lint threshold.
 */

import type { ActionType, GliaAction, GliaTrustState } from './types.js';

/**
 * Default rejection-rate threshold above which the post-graduation anomaly
 * fires. Picked at 30% to match the task brief — the propose→act_report gate
 * is 10%, so 30% is the smallest multiple that unambiguously indicates the
 * worker has regressed since being trusted. Configurable per-call through
 * `buildAutonomousDigest` options.
 */
export const DEFAULT_REJECTION_RATE_ANOMALY_THRESHOLD = 0.3;

/** A single autonomous action surfaced in the digest. */
export interface DigestActionEntry {
  id: string;
  affectedIds: string[];
  rationale: string;
  executedAt: string;
}

/** Per action-type grouping in the digest. */
export interface DigestActionGroup {
  actionType: ActionType;
  count: number;
  actions: DigestActionEntry[];
}

/**
 * Anomaly: action type whose post-graduation rejection/revert rate exceeds
 * the configured threshold.
 *
 * `rejectionRatePostGraduation` is computed as
 * `revertedCount / (executedAutonomous + revertedCount)` since the trust
 * state's `autonomousSince` timestamp — once an action type graduates to
 * `act_report`, the user can no longer reject pre-execution, so reverts
 * are the only signal of dissatisfaction.
 */
export interface DigestAnomaly {
  actionType: ActionType;
  rejectionRatePostGraduation: number;
  threshold: number;
  autonomousSince: string;
  executedCount: number;
  revertedCount: number;
}

/** The full autonomous digest payload returned by `cerebrum.glia.digest`. */
export interface AutonomousDigestReport {
  period: 'daily' | 'weekly';
  startDate: string;
  endDate: string;
  totalAutonomousActions: number;
  groups: DigestActionGroup[];
  anomalies: DigestAnomaly[];
}

export interface AutonomousDigestInput {
  /** Autonomous (status=executed, decided_at IS NULL) actions in window. */
  actions: GliaAction[];
  /** Current trust state for every action type — used for anomaly detection. */
  trustStates: GliaTrustState[];
  /**
   * Counts of executed autonomous actions by action type since each type's
   * `autonomousSince` timestamp. Used to compute the post-graduation rate.
   */
  postGraduationExecutedByType: Partial<Record<ActionType, number>>;
  /**
   * Counts of reverted autonomous actions by action type since each type's
   * `autonomousSince` timestamp.
   */
  postGraduationRevertedByType: Partial<Record<ActionType, number>>;
  period: 'daily' | 'weekly';
  startDate: string;
  endDate: string;
  rejectionRateThreshold?: number;
}

/**
 * Build the autonomous-action digest for `cerebrum.glia.digest`.
 *
 * Caller is responsible for filtering to autonomous executions
 * (`status='executed'` AND `decided_at IS NULL`) — defensive checks here
 * skip anything that slips through.
 *
 * Pure function: no DB access. The caller assembles input from the action
 * service so this stays trivially testable.
 */
export function buildAutonomousDigest(input: AutonomousDigestInput): AutonomousDigestReport {
  const threshold = input.rejectionRateThreshold ?? DEFAULT_REJECTION_RATE_ANOMALY_THRESHOLD;
  const groups = groupAutonomousActions(input.actions);
  const anomalies = detectRejectionAnomalies(
    input.trustStates,
    input.postGraduationExecutedByType,
    input.postGraduationRevertedByType,
    threshold
  );

  return {
    period: input.period,
    startDate: input.startDate,
    endDate: input.endDate,
    totalAutonomousActions: input.actions.length,
    groups,
    anomalies,
  };
}

function groupAutonomousActions(actions: GliaAction[]): DigestActionGroup[] {
  const buckets = new Map<ActionType, DigestActionEntry[]>();
  for (const action of actions) {
    // Defensive: caller should already filter these out.
    if (action.decidedAt !== null || action.status !== 'executed') continue;
    if (action.executedAt === null) continue;

    const entry: DigestActionEntry = {
      id: action.id,
      affectedIds: action.affectedIds,
      rationale: action.rationale,
      executedAt: action.executedAt,
    };
    const existing = buckets.get(action.actionType);
    if (existing) {
      existing.push(entry);
    } else {
      buckets.set(action.actionType, [entry]);
    }
  }

  const groups: DigestActionGroup[] = [];
  for (const [actionType, entries] of buckets) {
    // Within a group, sort by executedAt ascending so the digest reads
    // chronologically when rendered as a bullet list.
    entries.sort((a, b) => a.executedAt.localeCompare(b.executedAt));
    groups.push({ actionType, count: entries.length, actions: entries });
  }
  // Stable order across groups: highest volume first, ties broken alphabetically.
  groups.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.actionType.localeCompare(b.actionType);
  });

  return groups;
}

function detectRejectionAnomalies(
  trustStates: GliaTrustState[],
  executedByType: Partial<Record<ActionType, number>>,
  revertedByType: Partial<Record<ActionType, number>>,
  threshold: number
): DigestAnomaly[] {
  const anomalies: DigestAnomaly[] = [];
  for (const state of trustStates) {
    // Anomaly only meaningful once a type has actually graduated.
    if (!state.autonomousSince) continue;
    if (state.currentPhase === 'propose') continue;

    const executed = executedByType[state.actionType] ?? 0;
    const reverted = revertedByType[state.actionType] ?? 0;
    const total = executed + reverted;
    if (total === 0) continue;

    const rate = reverted / total;
    if (rate > threshold) {
      anomalies.push({
        actionType: state.actionType,
        rejectionRatePostGraduation: rate,
        threshold,
        autonomousSince: state.autonomousSince,
        executedCount: executed,
        revertedCount: reverted,
      });
    }
  }
  return anomalies;
}

/**
 * Render the autonomous digest as a concise plain-text summary suitable for
 * the shell nudge body and the Telegram/Moltbot message body. Kept short
 * enough to skim in under 30 seconds (PRD-086 US-04 note).
 *
 * Markdown is intentionally avoided here — the Telegram dispatcher escapes
 * the body for MarkdownV2 when it forwards, and the shell notification
 * surface renders it as plain text.
 */
export function renderAutonomousDigestText(report: AutonomousDigestReport): string {
  const lines: string[] = [];
  const periodLabel = report.period === 'daily' ? 'Daily' : 'Weekly';
  lines.push(`${periodLabel} Glia digest — ${report.totalAutonomousActions} autonomous actions`);

  for (const group of report.groups) {
    lines.push('');
    lines.push(`${group.actionType} (${group.count}):`);
    // Cap the per-group preview at 5 entries so the message stays skimmable.
    // The full list is still queryable via `cerebrum.glia.actions.history`.
    const previewLimit = 5;
    for (const entry of group.actions.slice(0, previewLimit)) {
      const affected = entry.affectedIds.join(', ');
      lines.push(`  - [${affected}] ${entry.rationale}`);
    }
    if (group.actions.length > previewLimit) {
      lines.push(`  - +${group.actions.length - previewLimit} more`);
    }
  }

  if (report.anomalies.length > 0) {
    lines.push('');
    lines.push('Anomalies:');
    for (const anomaly of report.anomalies) {
      const pct = (anomaly.rejectionRatePostGraduation * 100).toFixed(1);
      const total = anomaly.executedCount + anomaly.revertedCount;
      lines.push(
        `  - ${anomaly.actionType}: ${pct}% post-graduation rejection rate (${anomaly.revertedCount}/${total})`
      );
    }
  }

  return lines.join('\n');
}
