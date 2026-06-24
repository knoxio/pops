/**
 * StalenessDetector (see docs/prds/proactive-nudges).
 *
 * Flags active engrams not modified within the configured threshold (default
 * 90 days). Suppresses detection on corpora younger than 30 days and excludes
 * archived/consolidated engrams. Citation count adjusts the effective
 * threshold per-engram (cited engrams are less likely to be flagged stale).
 */
import { adjustedStalenessDays } from './citation-tracker.js';

import type {
  DetectorResult,
  EngramSummary,
  NudgeCandidate,
  NudgePriority,
  NudgeThresholds,
} from '../types.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CORPUS_MATURITY_DAYS = 30;

function daysBetween(isoA: string, isoB: string): number {
  return Math.floor((new Date(isoB).getTime() - new Date(isoA).getTime()) / MS_PER_DAY);
}

function stalePriority(staleDays: number, thresholdDays: number): NudgePriority {
  if (staleDays > thresholdDays * 3) return 'high';
  if (staleDays > thresholdDays * 2) return 'medium';
  return 'low';
}

function buildTitle(engram: EngramSummary, staleDays: number): string {
  const raw = `Stale: ${engram.title} (${staleDays}d)`;
  return raw.length > 100 ? raw.slice(0, 97) + '...' : raw;
}

function buildBody(engram: EngramSummary, staleDays: number): string {
  return (
    `**${engram.title}** (\`${engram.id}\`) has not been modified in ${staleDays} days.\n\n` +
    `- Type: ${engram.type}\n` +
    `- Last modified: ${engram.modifiedAt}\n` +
    `- Scopes: ${engram.scopes.join(', ')}\n\n` +
    `Consider reviewing, updating, or archiving this engram.`
  );
}

function parseStaleDays(body: string): number {
  const match = /modified in (\d+) days/.exec(body);
  return match ? Number(match[1]) : 0;
}

export class StalenessDetector {
  private readonly thresholds: NudgeThresholds;
  private readonly now: () => Date;

  constructor(thresholds: NudgeThresholds, now?: () => Date) {
    this.thresholds = thresholds;
    this.now = now ?? (() => new Date());
  }

  detect(engrams: EngramSummary[]): DetectorResult {
    const active = engrams.filter((e) => e.status !== 'archived' && e.status !== 'consolidated');
    if (active.length === 0) return { nudges: [] };

    const oldestCreated = active.reduce(
      (oldest, e) => (e.createdAt < oldest ? e.createdAt : oldest),
      active[0]?.createdAt ?? this.now().toISOString()
    );
    const corpusAgeDays = daysBetween(oldestCreated, this.now().toISOString());
    if (corpusAgeDays < CORPUS_MATURITY_DAYS) return { nudges: [] };

    const nowIso = this.now().toISOString();
    const nudges: NudgeCandidate[] = [];

    for (const engram of active) {
      const staleDays = daysBetween(engram.modifiedAt, nowIso);
      const effectiveThreshold = adjustedStalenessDays(this.thresholds.stalenessDays, engram.id);
      if (staleDays < effectiveThreshold) continue;

      nudges.push({
        type: 'staleness',
        title: buildTitle(engram, staleDays),
        body: buildBody(engram, staleDays),
        engramIds: [engram.id],
        priority: stalePriority(staleDays, effectiveThreshold),
        expiresAt: null,
        action: {
          type: 'review',
          label: 'Mark as reviewed',
          params: { engramId: engram.id },
        },
      });
    }

    return { nudges: nudges.toSorted((a, b) => parseStaleDays(b.body) - parseStaleDays(a.body)) };
  }
}
