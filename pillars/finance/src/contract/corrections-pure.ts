/**
 * Pure, dependency-free correction helpers shipped as part of the finance
 * contract so both the pillar server AND browser consumers (the `app-finance`
 * import wizard's optimistic merge) share a single implementation.
 *
 * Nothing here touches the database, the filesystem, or any node-only API — it
 * operates on caller-supplied rule arrays and contract types, so it is safe to
 * bundle into the browser. The pillar's `api/modules/corrections/pure.ts`
 * re-exports {@link applyChangeSetToRules} (injecting its own `NotFoundError`)
 * rather than re-implementing it.
 */
import type { ChangeSet, ChangeSetOp } from './rest-corrections-schemas.js';

/** Confidence at/above which a learned correction is treated as a confident match. */
export const HIGH_CONFIDENCE_THRESHOLD = 0.9;

/**
 * API-facing correction shape: `tags` is a decoded `string[]` and `isActive`
 * is a real boolean, unlike the DB row which stores tags as a JSON string.
 */
export interface Correction {
  id: string;
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  tags: string[];
  transactionType: 'purchase' | 'transfer' | 'income' | null;
  isActive: boolean;
  priority: number;
  confidence: number;
  timesApplied: number;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Persisted correction row shape — structurally identical to the finance db's
 * `transaction_corrections` select row (`tags` is a JSON-encoded string). Kept
 * as an explicit contract type so browser consumers need no db dependency.
 */
export interface CorrectionRow {
  id: string;
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  tags: string;
  transactionType: 'purchase' | 'transfer' | 'income' | null;
  isActive: boolean;
  confidence: number;
  priority: number;
  timesApplied: number;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Canonicalise a transaction description for matching: uppercase, strip digits,
 * collapse whitespace. Identical to the db-side matcher's normaliser.
 */
export function normalizeDescription(description: string): string {
  return description.toUpperCase().replaceAll(/\d+/g, '').replaceAll(/\s+/g, ' ').trim();
}

function parseJsonStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

/** Decode a persisted {@link CorrectionRow} into the API {@link Correction} shape. */
export function toCorrection(row: CorrectionRow): Correction {
  return {
    id: row.id,
    descriptionPattern: row.descriptionPattern,
    matchType: row.matchType,
    entityId: row.entityId,
    entityName: row.entityName,
    location: row.location,
    tags: parseJsonStringArray(row.tags),
    transactionType: row.transactionType,
    isActive: Boolean(row.isActive),
    priority: row.priority,
    confidence: row.confidence,
    timesApplied: row.timesApplied,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

/** Encode an API {@link Correction} back into a persisted {@link CorrectionRow}. */
export function correctionToRow(c: Correction): CorrectionRow {
  return {
    id: c.id,
    descriptionPattern: c.descriptionPattern,
    matchType: c.matchType,
    entityId: c.entityId,
    entityName: c.entityName,
    location: c.location,
    tags: JSON.stringify(c.tags),
    transactionType: c.transactionType,
    isActive: c.isActive,
    confidence: c.confidence,
    priority: c.priority,
    timesApplied: c.timesApplied,
    createdAt: c.createdAt,
    lastUsedAt: c.lastUsedAt,
  };
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

/** Default `onMissing`: throw a plain error naming the absent correction id. */
function throwMissing(id: string): never {
  throw new Error(`Correction not found: ${id}`);
}

function applyMutatingInMemory(
  next: CorrectionRow[],
  byId: Map<string, CorrectionRow>,
  op: Exclude<ChangeSetOp, { op: 'add' }>,
  onMissing: (id: string) => never
): void {
  const existing = byId.get(op.id);
  if (!existing) onMissing(op.id);

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
 *
 * @param onMissing invoked (and expected to throw) when an edit/disable/remove
 *   op targets an id absent from `rules`. Defaults to throwing a plain `Error`;
 *   the pillar injects its own `NotFoundError` so the REST surface maps to 404.
 */
export function applyChangeSetToRules(
  rules: CorrectionRow[],
  changeSet: ChangeSet,
  onMissing: (id: string) => never = throwMissing
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
      applyMutatingInMemory(next, byId, op, onMissing);
    }
  }

  return next;
}
