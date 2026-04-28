/**
 * StalenessDetector (PRD-084 US-02).
 *
 * Flags engrams that have not been modified within the configured threshold
 * (default 90 days). Respects the 30-day suppression rule on fresh corpora
 * and excludes archived/consolidated engrams.
 */
import type {
  DetectorResult,
  EngramSummary,
  NudgeCandidate,
  NudgePriority,
  NudgeThresholds,
} from '../types.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Minimum corpus age (days) before staleness detection activates. */
const CORPUS_MATURITY_DAYS = 30;

/** Calculate days between two ISO dates. */
function daysBetween(isoA: string, isoB: string): number {
  return Math.floor((new Date(isoB).getTime() - new Date(isoA).getTime()) / MS_PER_DAY);
}

/** Determine priority based on how stale the engram is. */
function stalePriority(staleDays: number, thresholdDays: number): NudgePriority {
  if (staleDays > thresholdDays * 3) return 'high';
  if (staleDays > thresholdDays * 2) return 'medium';
  return 'low';
}

export class StalenessDetector {
  private readonly thresholds: NudgeThresholds;
  private readonly now: () => Date;

  constructor(thresholds: NudgeThresholds, now?: () => Date) {
    this.thresholds = thresholds;
    this.now = now ?? (() => new Date());
  }

  /**
   * Scan engrams for staleness. Returns nudge candidates for engrams
   * whose `modifiedAt` timestamp exceeds the configured threshold.
   */
  detect(engrams: EngramSummary[]): DetectorResult {
    const active = engrams.filter((e) => e.status !== 'archived' && e.status !== 'consolidated');

    if (active.length === 0) {
      return { nudges: [] };
    }

    // 30-day suppression on fresh corpora.
    const oldestCreated = active.reduce(
      (oldest, e) => (e.createdAt < oldest ? e.createdAt : oldest),
      active[0]?.createdAt ?? this.now().toISOString()
    );
    const corpusAgeDays = daysBetween(oldestCreated, this.now().toISOString());
    if (corpusAgeDays < CORPUS_MATURITY_DAYS) {
      return { nudges: [] };
    }

    const nowIso = this.now().toISOString();
    const nudges: NudgeCandidate[] = [];

    for (const engram of active) {
      const staleDays = daysBetween(engram.modifiedAt, nowIso);
      if (staleDays < this.thresholds.stalenessDays) continue;

      const priority = stalePriority(staleDays, this.thresholds.stalenessDays);

      nudges.push({
        type: 'staleness',
        title: buildTitle(engram, staleDays),
        body: buildBody(engram, staleDays),
        engramIds: [engram.id],
        priority,
        expiresAt: null,
        action: {
          type: 'review',
          label: 'Mark as reviewed',
          params: { engramId: engram.id },
        },
      });
    }

    // Sort by age descending (stalest first).
    const sorted = nudges.toSorted((a, b) => parseStaleDays(b.body) - parseStaleDays(a.body));

    return { nudges: sorted };
  }
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

/** Extract stale-days from body text for sorting. */
function parseStaleDays(body: string): number {
  const match = /modified in (\d+) days/.exec(body);
  return match ? Number(match[1]) : 0;
}
