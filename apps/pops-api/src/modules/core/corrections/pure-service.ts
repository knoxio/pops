import { applyChangeSetToRules } from './apply-changeset-rules.js';
import { classifyCorrectionMatch, normalizeDescription, toCorrection } from './types.js';

export { applyChangeSetToRules } from './apply-changeset-rules.js';
export {
  computeImpactCounts,
  mergeTags,
  outcomeChanged,
  outcomeFromMatch,
} from './preview-helpers.js';

import type {
  ChangeSet,
  ChangeSetPreviewDiff,
  ChangeSetPreviewSummary,
  Correction,
  CorrectionMatchResult,
  CorrectionMatchSummary,
  CorrectionRow,
} from './types.js';

/**
 * Pure in-memory matcher used for previews and determinism tests.
 * Returns ALL matching correction rules in priority order (priority ASC, id ASC).
 * The first entry is the winner; subsequent entries are overridden alternatives.
 * Reuses the same eligibility filtering and ruleMatchesDescription logic as
 * findMatchingCorrectionFromRules — no separate matching pass.
 */
export function findAllMatchingCorrectionFromRules(
  description: string,
  rules: CorrectionRow[],
  minConfidence: number = 0.7
): CorrectionRow[] {
  const normalized = normalizeDescription(description);
  const eligible = rules
    .filter((r) => r.isActive && r.confidence >= minConfidence)
    .toSorted((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });

  return eligible.filter((rule) => ruleMatchesDescription(rule, normalized));
}

/**
 * Pure in-memory matcher used for previews and determinism tests.
 * Mirrors production semantics:
 * - normalizeDescription on input
 * - rules sorted by priority ASC (lower = higher priority), id ASC tie-breaker
 * - ignore inactive rules
 * - ignore rules below minConfidence
 * - first matching rule in priority order wins
 */
export function findMatchingCorrectionFromRules(
  description: string,
  rules: CorrectionRow[],
  minConfidence: number = 0.7
): CorrectionMatchResult | null {
  const allMatches = findAllMatchingCorrectionFromRules(description, rules, minConfidence);
  const first = allMatches[0];
  if (!first) return null;
  return classifyCorrectionMatch(first);
}

/** Test whether a single rule's pattern matches a normalized description. */
export function ruleMatchesDescription(rule: CorrectionRow, normalized: string): boolean {
  const pattern = rule.descriptionPattern;
  switch (rule.matchType) {
    case 'exact':
      return pattern.toUpperCase() === normalized;
    case 'contains':
      return pattern.length > 0 && normalized.includes(pattern.toUpperCase());
    case 'regex':
      if (pattern.length === 0) return false;
      try {
        return new RegExp(pattern, 'i').test(normalized);
      } catch {
        return false;
      }
    default:
      return false;
  }
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

export function previewChangeSetImpact(args: {
  rules: CorrectionRow[];
  changeSet: ChangeSet;
  transactions: Array<{ checksum?: string; description: string }>;
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

    return { checksum: t.checksum, description: t.description, before, after, changed };
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

/**
 * Given a ChangeSet and a list of existing rules, build a map of
 * `{ ruleId → Correction }` containing only the rules referenced by
 * `edit` / `disable` / `remove` ops. Used to hydrate `targetRules` on
 * proposal / revise responses so the frontend can scope preview re-runs
 * without a separate round-trip through `core.corrections.list`.
 *
 * Missing ids (referenced by a ChangeSet but not present in `rules`) are
 * silently omitted — the client already tolerates a missing `targetRule`
 * by falling back to the full preview set.
 */
export function buildTargetRulesMap(
  changeSet: ChangeSet,
  rules: CorrectionRow[]
): Record<string, Correction> {
  const referencedIds = new Set<string>();
  for (const op of changeSet.ops) {
    if (op.op === 'add') continue;
    referencedIds.add(op.id);
  }
  if (referencedIds.size === 0) return {};

  const byId = new Map(rules.map((r) => [r.id, r]));
  const out: Record<string, Correction> = {};
  for (const id of referencedIds) {
    const row = byId.get(id);
    if (row) out[id] = toCorrection(row);
  }
  return out;
}
