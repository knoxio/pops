import { NotFoundError } from '../../../shared/errors.js';
import { parseJsonStringArray } from '../../../shared/json.js';
import { classifyCorrectionMatch, normalizeDescription, toCorrection } from './types.js';

import type {
  ChangeSet,
  ChangeSetImpactCounts,
  ChangeSetImpactItem,
  ChangeSetOp,
  ChangeSetPreviewDiff,
  ChangeSetPreviewSummary,
  Correction,
  CorrectionClassificationOutcome,
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

export function applyChangeSetToRules(
  rules: CorrectionRow[],
  changeSet: ChangeSet
): CorrectionRow[] {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const next: CorrectionRow[] = [...rules];

  let tempCounter = 0;
  // Deterministic ordering: add → edit → disable → remove (match DB apply semantics)
  const order: Record<ChangeSetOp['op'], number> = { add: 1, edit: 2, disable: 3, remove: 4 };
  const ops = [...changeSet.ops].toSorted((a, b) => order[a.op] - order[b.op]);

  for (const op of ops) {
    if (op.op === 'add') {
      tempCounter += 1;
      const now = new Date().toISOString();
      next.push({
        id: `temp:${tempCounter}`,
        descriptionPattern: normalizeDescription(op.data.descriptionPattern),
        matchType: op.data.matchType,
        entityId: op.data.entityId ?? null,
        entityName: op.data.entityName ?? null,
        location: op.data.location ?? null,
        tags: JSON.stringify(op.data.tags ?? []),
        transactionType: op.data.transactionType ?? null,
        isActive: op.data.isActive ?? true,
        confidence: op.data.confidence ?? 0.5,
        priority: op.data.priority ?? 0,
        timesApplied: 0,
        createdAt: now,
        lastUsedAt: null,
      });
      continue;
    }

    const existing = byId.get(op.id);
    if (!existing) throw new NotFoundError('Correction', op.id);

    const replace = (updated: CorrectionRow): void => {
      const idx = next.findIndex((r) => r.id === existing.id);
      if (idx !== -1) next[idx] = updated;
      byId.set(existing.id, updated);
    };

    if (op.op === 'edit') {
      replace({
        ...existing,
        entityId: op.data.entityId !== undefined ? op.data.entityId : existing.entityId,
        entityName: op.data.entityName !== undefined ? op.data.entityName : existing.entityName,
        location: op.data.location !== undefined ? op.data.location : existing.location,
        tags: op.data.tags !== undefined ? JSON.stringify(op.data.tags) : existing.tags,
        transactionType:
          op.data.transactionType !== undefined
            ? op.data.transactionType
            : existing.transactionType,
        isActive:
          op.data.isActive !== undefined ? Boolean(op.data.isActive) : Boolean(existing.isActive),
        confidence: op.data.confidence !== undefined ? op.data.confidence : existing.confidence,
      });
    } else if (op.op === 'disable') {
      replace({ ...existing, isActive: false });
    } else if (op.op === 'remove') {
      const idx = next.findIndex((r) => r.id === existing.id);
      if (idx !== -1) next.splice(idx, 1);
      byId.delete(existing.id);
    }
  }

  return next;
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

export function outcomeFromMatch(
  match: CorrectionMatchResult | null
): CorrectionClassificationOutcome {
  if (!match) {
    return {
      ruleId: null,
      entityId: null,
      entityName: null,
      location: null,
      tags: [],
      transactionType: null,
    };
  }

  const r = match.correction;
  return {
    ruleId: r.id,
    entityId: r.entityId ?? null,
    entityName: r.entityName ?? null,
    location: r.location ?? null,
    tags: parseJsonStringArray(r.tags),
    transactionType: r.transactionType ?? null,
  };
}

export function mergeTags(base: string[], add: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of base) {
    if (!seen.has(t)) {
      seen.add(t);
      result.push(t);
    }
  }
  for (const t of add) {
    if (!seen.has(t)) {
      seen.add(t);
      result.push(t);
    }
  }
  return result;
}

export function outcomeChanged(
  a: CorrectionClassificationOutcome,
  b: CorrectionClassificationOutcome
): boolean {
  if (a.ruleId !== b.ruleId) return true;
  if (a.entityId !== b.entityId) return true;
  if (a.entityName !== b.entityName) return true;
  if (a.location !== b.location) return true;
  if (a.transactionType !== b.transactionType) return true;
  if (a.tags.length !== b.tags.length) return true;
  for (let i = 0; i < a.tags.length; i += 1) {
    if (a.tags[i] !== b.tags[i]) return true;
  }
  return false;
}

export function computeImpactCounts(items: ChangeSetImpactItem[]): ChangeSetImpactCounts {
  let entityChanges = 0;
  let locationChanges = 0;
  let tagChanges = 0;
  let typeChanges = 0;

  for (const item of items) {
    if (
      item.before.entityId !== item.after.entityId ||
      item.before.entityName !== item.after.entityName
    ) {
      entityChanges += 1;
    }
    if (item.before.location !== item.after.location) {
      locationChanges += 1;
    }
    if (item.before.transactionType !== item.after.transactionType) {
      typeChanges += 1;
    }
    if (
      item.before.tags.length !== item.after.tags.length ||
      item.before.tags.some((t, i) => item.after.tags[i] !== t)
    ) {
      tagChanges += 1;
    }
  }

  return {
    affected: items.length,
    entityChanges,
    locationChanges,
    tagChanges,
    typeChanges,
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
