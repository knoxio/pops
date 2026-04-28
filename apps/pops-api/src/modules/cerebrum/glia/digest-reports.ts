/**
 * Digest reports for glia actions (#2248).
 *
 * Generates daily/weekly digest summaries of glia curation activity.
 * Reports include action counts by type, approval rates, and notable events.
 */
import type { GliaAction, ActionType } from './types.js';

/** A single digest report. */
export interface DigestReport {
  period: 'daily' | 'weekly';
  startDate: string;
  endDate: string;
  summary: DigestSummary;
  highlights: string[];
}

/** Aggregated metrics for a digest period. */
export interface DigestSummary {
  totalActions: number;
  byType: Record<ActionType, TypeSummary>;
  approvalRate: number;
  revertCount: number;
}

/** Per-type metrics. */
export interface TypeSummary {
  total: number;
  approved: number;
  rejected: number;
  executed: number;
  reverted: number;
}

function emptyTypeSummary(): TypeSummary {
  return { total: 0, approved: 0, rejected: 0, executed: 0, reverted: 0 };
}

/** Build a digest report from a list of actions within a date range. */
export function buildDigestReport(
  actions: GliaAction[],
  period: 'daily' | 'weekly',
  startDate: string,
  endDate: string
): DigestReport {
  const summary = computeSummary(actions);
  const highlights = generateHighlights(actions, summary);

  return { period, startDate, endDate, summary, highlights };
}

function computeSummary(actions: GliaAction[]): DigestSummary {
  const byType: Record<ActionType, TypeSummary> = {
    prune: emptyTypeSummary(),
    consolidate: emptyTypeSummary(),
    link: emptyTypeSummary(),
    audit: emptyTypeSummary(),
  };

  let approvedCount = 0;
  let decidedCount = 0;
  let revertCount = 0;

  for (const action of actions) {
    const typeSummary = byType[action.actionType];
    typeSummary.total++;

    if (action.status === 'approved' || action.status === 'executed') {
      typeSummary.approved++;
      approvedCount++;
      decidedCount++;
    }
    if (action.status === 'rejected') {
      typeSummary.rejected++;
      decidedCount++;
    }
    if (action.status === 'executed') {
      typeSummary.executed++;
    }
    if (action.status === 'reverted') {
      typeSummary.reverted++;
      revertCount++;
    }
  }

  return {
    totalActions: actions.length,
    byType,
    approvalRate: decidedCount > 0 ? approvedCount / decidedCount : 0,
    revertCount,
  };
}

function generateHighlights(actions: GliaAction[], summary: DigestSummary): string[] {
  const highlights: string[] = [];

  if (summary.totalActions === 0) {
    highlights.push('No glia activity in this period.');
    return highlights;
  }

  highlights.push(`${summary.totalActions} total actions processed.`);

  if (summary.approvalRate >= 0.9) {
    highlights.push(`High approval rate: ${(summary.approvalRate * 100).toFixed(0)}%.`);
  } else if (summary.approvalRate < 0.5 && summary.totalActions > 5) {
    highlights.push(
      `Low approval rate: ${(summary.approvalRate * 100).toFixed(0)}% — consider reviewing thresholds.`
    );
  }

  if (summary.revertCount > 0) {
    highlights.push(`${summary.revertCount} action(s) were reverted.`);
  }

  const mostActive = Object.entries(summary.byType)
    .filter(([, v]) => v.total > 0)
    .toSorted(([, a], [, b]) => b.total - a.total);

  const topEntry = mostActive[0];
  if (topEntry) {
    const [type, counts] = topEntry;
    highlights.push(`Most active: ${type} (${counts.total} actions).`);
  }

  // Flag any actions that were reverted
  const revertedActions = actions.filter((a) => a.status === 'reverted');
  for (const reverted of revertedActions.slice(0, 3)) {
    highlights.push(`Reverted: ${reverted.rationale.slice(0, 80)}`);
  }

  return highlights;
}

/**
 * Compute date range for a daily digest (previous day).
 * Returns ISO date strings for start and end of the previous day.
 */
export function dailyDigestRange(now: Date): { startDate: string; endDate: string } {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 1);
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

/**
 * Compute date range for a weekly digest (previous 7 days).
 * Returns ISO date strings for start and end of the week.
 */
export function weeklyDigestRange(now: Date): { startDate: string; endDate: string } {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}
