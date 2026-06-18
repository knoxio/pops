/**
 * Pure, in-memory ChangeSet preview — the deterministic "what would change"
 * diff the import wizard renders before a user approves a correction-rule
 * ChangeSet.
 *
 * Ported (per the severance rules) from the monolith
 * `core/corrections/pure-service.ts` (`summarizeMatch` + `previewChangeSetImpact`).
 * No DB: the caller supplies the baseline rule set and the transactions to
 * diff, so the result is reproducible and side-effect-free. Reuses the
 * pillar's own `findMatchingCorrectionFromRules` / `applyChangeSetToRules`
 * so a preview matches exactly what apply-time would produce.
 */
import { applyChangeSetToRules, findMatchingCorrectionFromRules } from './pure.js';

import type { ChangeSet } from '../../../contract/rest-corrections.js';
import type { CorrectionMatchResult, CorrectionMatchStatus, CorrectionRow } from './types.js';

/** Per-transaction match outcome, collapsed to the fields a preview compares. */
export interface CorrectionMatchSummary {
  matched: boolean;
  status: CorrectionMatchStatus | null;
  ruleId: string | null;
  confidence: number | null;
}

export interface ChangeSetPreviewDiff {
  checksum?: string;
  description: string;
  before: CorrectionMatchSummary;
  after: CorrectionMatchSummary;
  changed: boolean;
}

export interface ChangeSetPreviewSummary {
  total: number;
  newMatches: number;
  removedMatches: number;
  statusChanges: number;
  netMatchedDelta: number;
}

export interface PreviewTransaction {
  checksum?: string;
  description: string;
}

export function summarizeMatch(match: CorrectionMatchResult | null): CorrectionMatchSummary {
  if (!match) return { matched: false, status: null, ruleId: null, confidence: null };
  return {
    matched: true,
    status: match.status,
    ruleId: match.correction.id,
    confidence: match.correction.confidence,
  };
}

/**
 * Diff the winning correction match for each transaction before vs after a
 * ChangeSet is (hypothetically) applied to `rules`. `changed` flags any shift
 * in matched / status / winning rule; the summary rolls those up.
 */
export function previewChangeSetImpact(args: {
  rules: CorrectionRow[];
  changeSet: ChangeSet;
  transactions: PreviewTransaction[];
  minConfidence: number;
}): { diffs: ChangeSetPreviewDiff[]; summary: ChangeSetPreviewSummary } {
  const rulesAfter = applyChangeSetToRules(args.rules, args.changeSet);

  const diffs: ChangeSetPreviewDiff[] = args.transactions.map((t) => {
    const before = summarizeMatch(
      findMatchingCorrectionFromRules(t.description, args.rules, args.minConfidence)
    );
    const after = summarizeMatch(
      findMatchingCorrectionFromRules(t.description, rulesAfter, args.minConfidence)
    );
    const changed =
      before.matched !== after.matched ||
      before.status !== after.status ||
      before.ruleId !== after.ruleId;

    return {
      ...(t.checksum !== undefined && { checksum: t.checksum }),
      description: t.description,
      before,
      after,
      changed,
    };
  });

  const newMatches = diffs.filter((d) => !d.before.matched && d.after.matched).length;
  const removedMatches = diffs.filter((d) => d.before.matched && !d.after.matched).length;
  const statusChanges = diffs.filter(
    (d) => d.before.matched && d.after.matched && d.before.status !== d.after.status
  ).length;

  return {
    diffs,
    summary: {
      total: diffs.length,
      newMatches,
      removedMatches,
      statusChanges,
      netMatchedDelta: newMatches - removedMatches,
    },
  };
}
