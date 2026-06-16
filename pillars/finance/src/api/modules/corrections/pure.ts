/**
 * Pure, in-memory correction-rule matchers + ChangeSet application.
 *
 * Copied (per the severance rules) from the monolith
 * `core/corrections/{pure-service,apply-changeset-rules}.ts`. These never touch
 * the database — they operate on caller-supplied rule arrays so the import
 * re-evaluation paths can merge pending (un-persisted) ChangeSets with the DB
 * rule set and re-run matching deterministically.
 *
 * `normalizeDescription` comes from the pillar's own
 * `transactionCorrectionsService` so the normalisation is identical to the
 * DB-side matcher.
 */
import { transactionCorrectionsService } from '../../../db/index.js';
import { NotFoundError } from '../../shared/errors.js';
import { classifyCorrectionMatch } from './types.js';

import type { ChangeSet, ChangeSetOp } from '../../../contract/rest-corrections.js';
import type { CorrectionMatchResult, CorrectionRow } from './types.js';

const { normalizeDescription } = transactionCorrectionsService;

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

/**
 * Return ALL matching correction rules in priority order (priority ASC, id ASC).
 * The first entry is the winner; subsequent entries are overridden alternatives.
 * Inactive rules and rules below `minConfidence` are filtered out first.
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

/** First matching rule in priority order, classified — or null when none match. */
export function findMatchingCorrectionFromRules(
  description: string,
  rules: CorrectionRow[],
  minConfidence: number = 0.7
): CorrectionMatchResult | null {
  const first = findAllMatchingCorrectionFromRules(description, rules, minConfidence)[0];
  return first ? classifyCorrectionMatch(first) : null;
}

function makeAddedRow(op: Extract<ChangeSetOp, { op: 'add' }>, tempId: string): CorrectionRow {
  return {
    id: tempId,
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
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
}

function withDefined<T>(provided: T | undefined, fallback: T): T {
  return provided ?? fallback;
}

function applyEditOpInMemory(
  existing: CorrectionRow,
  op: Extract<ChangeSetOp, { op: 'edit' }>
): CorrectionRow {
  return {
    ...existing,
    entityId: withDefined(op.data.entityId, existing.entityId),
    entityName: withDefined(op.data.entityName, existing.entityName),
    location: withDefined(op.data.location, existing.location),
    tags: op.data.tags !== undefined ? JSON.stringify(op.data.tags) : existing.tags,
    transactionType: withDefined(op.data.transactionType, existing.transactionType),
    isActive:
      op.data.isActive !== undefined ? Boolean(op.data.isActive) : Boolean(existing.isActive),
    confidence: withDefined(op.data.confidence, existing.confidence),
  };
}

function replaceRow(
  next: CorrectionRow[],
  byId: Map<string, CorrectionRow>,
  updated: CorrectionRow
): void {
  const idx = next.findIndex((r) => r.id === updated.id);
  if (idx !== -1) next[idx] = updated;
  byId.set(updated.id, updated);
}

function applyMutatingInMemory(
  next: CorrectionRow[],
  byId: Map<string, CorrectionRow>,
  op: Exclude<ChangeSetOp, { op: 'add' }>
): void {
  const existing = byId.get(op.id);
  if (!existing) throw new NotFoundError('Correction', op.id);

  if (op.op === 'edit') {
    replaceRow(next, byId, applyEditOpInMemory(existing, op));
    return;
  }
  if (op.op === 'disable') {
    replaceRow(next, byId, { ...existing, isActive: false });
    return;
  }
  const idx = next.findIndex((r) => r.id === existing.id);
  if (idx !== -1) next.splice(idx, 1);
  byId.delete(existing.id);
}

/**
 * Apply a ChangeSet to an in-memory rule array (no DB). Ops are applied in a
 * fixed order (add → edit → disable → remove) so previews are deterministic.
 */
export function applyChangeSetToRules(
  rules: CorrectionRow[],
  changeSet: ChangeSet
): CorrectionRow[] {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const next: CorrectionRow[] = [...rules];

  let tempCounter = 0;
  const order: Record<ChangeSetOp['op'], number> = { add: 1, edit: 2, disable: 3, remove: 4 };
  const ops = [...changeSet.ops].toSorted((a, b) => order[a.op] - order[b.op]);

  for (const op of ops) {
    if (op.op === 'add') {
      tempCounter += 1;
      next.push(makeAddedRow(op, `temp:${tempCounter}`));
    } else {
      applyMutatingInMemory(next, byId, op);
    }
  }

  return next;
}
