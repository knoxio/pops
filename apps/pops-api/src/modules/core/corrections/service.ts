/**
 * Transaction corrections service
 * Manages learned patterns from user edits — Drizzle ORM
 */
import { eq, gte, desc, count, sql, and } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { transactionCorrections, transactions } from "@pops/db-types";
import { NotFoundError } from "../../../shared/errors.js";
import { parseJsonStringArray } from "../../../shared/json.js";
import type {
  CorrectionRow,
  CreateCorrectionInput,
  UpdateCorrectionInput,
  CorrectionMatchResult,
  ChangeSet,
  ChangeSetOp,
  ChangeSetPreviewDiff,
  ChangeSetPreviewSummary,
  CorrectionMatchSummary,
  ChangeSetProposal,
  CorrectionClassificationOutcome,
  ChangeSetImpactCounts,
  ChangeSetImpactItem,
} from "./types.js";
import { normalizeDescription, classifyCorrectionMatch } from "./types.js";

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
 * Pure in-memory matcher used for previews and determinism tests.
 * Mirrors production semantics:
 * - normalizeDescription
 * - exact matches win over contains matches
 * - ignore inactive rules
 * - ignore rules below minConfidence
 * - tie-break by confidence desc, then timesApplied desc
 */
export function findMatchingCorrectionFromRules(
  description: string,
  rules: CorrectionRow[],
  minConfidence: number = 0.7
): CorrectionMatchResult | null {
  const normalized = normalizeDescription(description);
  const eligible = rules.filter((r) => r.isActive && r.confidence >= minConfidence);

  const exactMatches = eligible
    .filter((r) => r.matchType === "exact" && r.descriptionPattern === normalized)
    .sort((a, b) => b.confidence - a.confidence || b.timesApplied - a.timesApplied);

  if (exactMatches[0]) return classifyCorrectionMatch(exactMatches[0]);

  const containsMatches = eligible
    .filter(
      (r) =>
        r.matchType === "contains" &&
        r.descriptionPattern.length > 0 &&
        normalized.includes(r.descriptionPattern)
    )
    .sort((a, b) => b.confidence - a.confidence || b.timesApplied - a.timesApplied);

  if (containsMatches[0]) return classifyCorrectionMatch(containsMatches[0]);

  const regexMatches = eligible
    .filter((r) => r.matchType === "regex" && r.descriptionPattern.length > 0)
    .filter((r) => {
      try {
        return new RegExp(r.descriptionPattern).test(normalized);
      } catch {
        // Invalid regex patterns should never match (avoid preview/apply crashes on bad data).
        return false;
      }
    })
    .sort((a, b) => b.confidence - a.confidence || b.timesApplied - a.timesApplied);

  if (regexMatches[0]) return classifyCorrectionMatch(regexMatches[0]);

  return null;
}

export function applyChangeSetToRules(
  rules: CorrectionRow[],
  changeSet: ChangeSet
): CorrectionRow[] {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const next: CorrectionRow[] = [...rules];

  let tempCounter = 0;
  // Deterministic ordering: add → edit → disable → remove (match DB apply semantics)
  const order: Record<ChangeSetOp["op"], number> = { add: 1, edit: 2, disable: 3, remove: 4 };
  const ops = [...changeSet.ops].sort((a, b) => order[a.op] - order[b.op]);

  for (const op of ops) {
    if (op.op === "add") {
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
        timesApplied: 0,
        createdAt: now,
        lastUsedAt: null,
      });
      continue;
    }

    const existing = byId.get(op.id);
    if (!existing) throw new NotFoundError("Correction", op.id);

    const replace = (updated: CorrectionRow): void => {
      const idx = next.findIndex((r) => r.id === existing.id);
      if (idx !== -1) next[idx] = updated;
      byId.set(existing.id, updated);
    };

    if (op.op === "edit") {
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
    } else if (op.op === "disable") {
      replace({ ...existing, isActive: false });
    } else if (op.op === "remove") {
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

function outcomeFromMatch(match: CorrectionMatchResult | null): CorrectionClassificationOutcome {
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

function mergeTags(base: string[], add: string[]): string[] {
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

function outcomeChanged(
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

function computeImpactCounts(items: ChangeSetImpactItem[]): ChangeSetImpactCounts {
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
 * Generate a bundled ChangeSet proposal from a single correction signal.
 *
 * The "signal" is a concrete desired rule definition (pattern + attributes).
 * If a rule already exists with the same normalized pattern + matchType, we propose an edit.
 * Otherwise we propose an add.
 *
 * Preview is bounded by a DB prefilter on transaction descriptions, and includes
 * transfer-only outcomes (type-only diffs) as affected items.
 */
export function proposeChangeSetFromCorrectionSignal(args: {
  signal: {
    descriptionPattern: string;
    matchType: "exact" | "contains" | "regex";
    entityId?: string | null;
    entityName?: string | null;
    location?: string | null;
    tags?: string[];
    transactionType?: "purchase" | "transfer" | "income" | null;
  };
  minConfidence: number;
  maxPreviewItems: number;
}): ChangeSetProposal {
  const db = getDrizzle();

  const normalizedPattern = normalizeDescription(args.signal.descriptionPattern);
  const matchType = args.signal.matchType;

  const existing = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.matchType, matchType),
        eq(transactionCorrections.descriptionPattern, normalizedPattern)
      )
    )
    .get();

  const changeSet: ChangeSet = existing
    ? {
        source: "correction-signal",
        reason: "Update existing correction rule from user correction signal",
        ops: [
          {
            op: "edit",
            id: existing.id,
            data: {
              entityId: args.signal.entityId,
              entityName: args.signal.entityName,
              location: args.signal.location,
              tags: args.signal.tags,
              transactionType: args.signal.transactionType,
            },
          },
        ],
      }
    : {
        source: "correction-signal",
        reason: "Create new correction rule from user correction signal",
        ops: [
          {
            op: "add",
            data: {
              descriptionPattern: normalizedPattern,
              matchType,
              entityId: args.signal.entityId ?? null,
              entityName: args.signal.entityName ?? null,
              location: args.signal.location ?? null,
              tags: args.signal.tags ?? [],
              transactionType: args.signal.transactionType ?? null,
              confidence: 0.95,
              isActive: true,
            },
          },
        ],
      };

  // Bounded preview: prefilter candidates using LIKE where possible.
  // Note: Our normalization strips digits and collapses whitespace; apply the same transformations in SQL
  // so the prefilter doesn't miss legitimate candidates.
  const sqlNormalizedDescription = sql`upper(${transactions.description})`;
  const sqlNoDigits = sql`replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(${sqlNormalizedDescription}, '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '')`;
  const sqlCollapsedSpaces = sql`replace(replace(replace(${sqlNoDigits}, '  ', ' '), '  ', ' '), '  ', ' ')`;

  const sqlPrefilterExpression =
    matchType === "regex" ? sqlNormalizedDescription : sqlCollapsedSpaces;
  const upperPattern = normalizedPattern;
  const candidates = db
    .select({
      id: transactions.id,
      description: transactions.description,
      type: transactions.type,
      tags: transactions.tags,
      entityId: transactions.entityId,
      entityName: transactions.entityName,
      location: transactions.location,
    })
    .from(transactions)
    .where(
      matchType === "regex"
        ? undefined
        : sql`${sqlPrefilterExpression} LIKE '%' || ${upperPattern} || '%'`
    )
    .limit(args.maxPreviewItems)
    .all();

  // Build a minimal in-memory rules list for deterministic before/after.
  const rulesBefore = db.select().from(transactionCorrections).all();
  const rulesAfter = applyChangeSetToRules(rulesBefore, changeSet);

  const affected: ChangeSetImpactItem[] = [];

  for (const t of candidates) {
    // Compute correction-rule-derived outcomes before/after.
    const matchBefore = findMatchingCorrectionFromRules(
      t.description,
      rulesBefore,
      args.minConfidence
    );
    const matchAfter = findMatchingCorrectionFromRules(
      t.description,
      rulesAfter,
      args.minConfidence
    );

    const beforeBase = outcomeFromMatch(matchBefore);
    const afterBase = outcomeFromMatch(matchAfter);

    // Apply rule tag semantics as "merge" (consistent with import bulk apply semantics).
    const before: CorrectionClassificationOutcome = {
      ...beforeBase,
      tags: mergeTags(parseJsonStringArray(t.tags), beforeBase.tags).sort(),
    };
    const after: CorrectionClassificationOutcome = {
      ...afterBase,
      tags: mergeTags(parseJsonStringArray(t.tags), afterBase.tags).sort(),
    };

    // If the rule sets a transactionType, that classification outcome should surface even if it's the only change.
    const changed = outcomeChanged(before, after);
    if (!changed) continue;

    affected.push({
      transactionId: t.id,
      description: t.description,
      before,
      after,
    });
  }

  const counts = computeImpactCounts(affected);

  const rationale = existing
    ? `Edit correction rule ${existing.id} (${matchType}:${normalizedPattern}) based on correction signal`
    : `Add new correction rule (${matchType}:${normalizedPattern}) based on correction signal`;

  return {
    changeSet,
    rationale,
    preview: {
      counts,
      affected,
    },
  };
}

export function applyChangeSet(changeSet: ChangeSet): CorrectionRow[] {
  const db = getDrizzle();

  return db.transaction((tx) => {
    // Deterministic ordering: add → edit → disable → remove
    const order: Record<ChangeSetOp["op"], number> = { add: 1, edit: 2, disable: 3, remove: 4 };
    const ops = [...changeSet.ops].sort((a, b) => order[a.op] - order[b.op]);

    for (const op of ops) {
      if (op.op === "add") {
        tx.insert(transactionCorrections)
          .values({
            descriptionPattern: normalizeDescription(op.data.descriptionPattern),
            matchType: op.data.matchType,
            entityId: op.data.entityId ?? null,
            entityName: op.data.entityName ?? null,
            location: op.data.location ?? null,
            tags: JSON.stringify(op.data.tags ?? []),
            transactionType: op.data.transactionType ?? null,
            isActive: op.data.isActive ?? true,
            confidence: op.data.confidence ?? 0.5,
          })
          .run();
        continue;
      }

      // For edit/disable/remove we validate existence first.
      const existing = tx
        .select()
        .from(transactionCorrections)
        .where(eq(transactionCorrections.id, op.id))
        .get();
      if (!existing) throw new NotFoundError("Correction", op.id);

      if (op.op === "edit") {
        const updates: Partial<typeof transactionCorrections.$inferInsert> = {};
        if (op.data.entityId !== undefined) updates.entityId = op.data.entityId;
        if (op.data.entityName !== undefined) updates.entityName = op.data.entityName;
        if (op.data.location !== undefined) updates.location = op.data.location;
        if (op.data.tags !== undefined) updates.tags = JSON.stringify(op.data.tags);
        if (op.data.transactionType !== undefined)
          updates.transactionType = op.data.transactionType;
        if (op.data.isActive !== undefined) updates.isActive = op.data.isActive;
        if (op.data.confidence !== undefined) updates.confidence = op.data.confidence;

        tx.update(transactionCorrections)
          .set(updates)
          .where(eq(transactionCorrections.id, op.id))
          .run();
        continue;
      }

      if (op.op === "disable") {
        tx.update(transactionCorrections)
          .set({ isActive: false })
          .where(eq(transactionCorrections.id, op.id))
          .run();
        continue;
      }

      // remove
      tx.delete(transactionCorrections).where(eq(transactionCorrections.id, op.id)).run();
    }

    return tx
      .select()
      .from(transactionCorrections)
      .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
      .all();
  });
}

/**
 * Find the best matching correction for a description.
 * Returns a classified result ("matched" if confidence >= 0.9, "uncertain" otherwise).
 * When a match is found, callers should skip all subsequent matching stages.
 */
export function findMatchingCorrection(
  description: string,
  minConfidence: number = 0.7
): CorrectionMatchResult | null {
  const db = getDrizzle();
  const normalized = normalizeDescription(description);

  // Try exact match first (highest priority)
  const [exactMatch] = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.isActive, true),
        eq(transactionCorrections.matchType, "exact"),
        eq(transactionCorrections.descriptionPattern, normalized),
        gte(transactionCorrections.confidence, minConfidence)
      )
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .limit(1)
    .all();

  if (exactMatch) return classifyCorrectionMatch(exactMatch);

  // Try contains match (pattern is substring of description)
  // This uses SQL LIKE which needs raw SQL for the dynamic pattern
  const [containsMatch] = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.isActive, true),
        eq(transactionCorrections.matchType, "contains"),
        sql`${normalized} LIKE '%' || ${transactionCorrections.descriptionPattern} || '%'`,
        gte(transactionCorrections.confidence, minConfidence)
      )
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .limit(1)
    .all();

  if (containsMatch) return classifyCorrectionMatch(containsMatch);

  // Try regex match (JS-level evaluation; SQLite has no built-in REGEXP by default)
  const regexCandidates = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.isActive, true),
        eq(transactionCorrections.matchType, "regex"),
        gte(transactionCorrections.confidence, minConfidence)
      )
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .all();

  for (const row of regexCandidates) {
    try {
      if (new RegExp(row.descriptionPattern).test(normalized)) {
        return classifyCorrectionMatch(row);
      }
    } catch {
      // Ignore invalid regex rules (treat as non-matching).
    }
  }

  return null;
}

/**
 * List all corrections with optional filters
 */
export function listCorrections(
  minConfidence?: number,
  limit: number = 50,
  offset: number = 0,
  matchType?: "exact" | "contains" | "regex"
): { rows: CorrectionRow[]; total: number } {
  const db = getDrizzle();

  const conditions = [];
  if (minConfidence !== undefined) {
    conditions.push(gte(transactionCorrections.confidence, minConfidence));
  }
  if (matchType) {
    conditions.push(eq(transactionCorrections.matchType, matchType));
  }
  const condition = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = db
    .select({ count: count() })
    .from(transactionCorrections)
    .where(condition)
    .all();

  const rows = db
    .select()
    .from(transactionCorrections)
    .where(condition)
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .limit(limit)
    .offset(offset)
    .all();

  return { rows: rows, total: countResult?.count ?? 0 };
}

/**
 * Get a single correction by ID
 */
export function getCorrection(id: string): CorrectionRow {
  const db = getDrizzle();
  const [row] = db
    .select()
    .from(transactionCorrections)
    .where(eq(transactionCorrections.id, id))
    .all();

  if (!row) {
    throw new NotFoundError("Correction", id);
  }

  return row;
}

/**
 * Find all corrections that match a description (for tag union across all rules)
 */
export function findAllMatchingCorrections(description: string): CorrectionRow[] {
  const db = getDrizzle();
  const normalized = normalizeDescription(description);

  const exactMatches = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.isActive, true),
        eq(transactionCorrections.matchType, "exact"),
        eq(transactionCorrections.descriptionPattern, normalized)
      )
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .all();

  const containsMatches = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.isActive, true),
        eq(transactionCorrections.matchType, "contains"),
        sql`${normalized} LIKE '%' || ${transactionCorrections.descriptionPattern} || '%'`
      )
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .all();

  const regexCandidates = db
    .select()
    .from(transactionCorrections)
    .where(
      and(eq(transactionCorrections.isActive, true), eq(transactionCorrections.matchType, "regex"))
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .all();

  const regexMatches: CorrectionRow[] = [];
  for (const row of regexCandidates) {
    try {
      if (new RegExp(row.descriptionPattern).test(normalized)) {
        regexMatches.push(row);
      }
    } catch {
      // ignore invalid regex
    }
  }

  return [...exactMatches, ...containsMatches, ...regexMatches];
}

/**
 * Create a new correction or update existing one
 */
export function createOrUpdateCorrection(input: CreateCorrectionInput): CorrectionRow {
  const db = getDrizzle();
  const normalized = normalizeDescription(input.descriptionPattern);

  // Check if pattern already exists
  const [existing] = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.descriptionPattern, normalized),
        eq(transactionCorrections.matchType, input.matchType)
      )
    )
    .all();

  if (existing) {
    // Update existing correction
    const newConfidence = Math.min(existing.confidence + 0.1, 1.0);
    const newTimesApplied = existing.timesApplied + 1;

    db.update(transactionCorrections)
      .set({
        confidence: newConfidence,
        timesApplied: newTimesApplied,
        lastUsedAt: new Date().toISOString(),
        entityId: input.entityId ?? existing.entityId,
        entityName: input.entityName ?? existing.entityName,
        location: input.location ?? existing.location,
        tags: JSON.stringify(input.tags ?? []),
        transactionType: input.transactionType ?? existing.transactionType,
        isActive: true,
      })
      .where(eq(transactionCorrections.id, existing.id))
      .run();

    return getCorrection(existing.id);
  }

  // Insert new correction
  const result = db
    .insert(transactionCorrections)
    .values({
      descriptionPattern: normalized,
      matchType: input.matchType,
      entityId: input.entityId ?? null,
      entityName: input.entityName ?? null,
      location: input.location ?? null,
      tags: JSON.stringify(input.tags ?? []),
      transactionType: input.transactionType ?? null,
      isActive: true,
    })
    .run();

  // lastInsertRowid is the integer rowid, not the UUID text primary key.
  // Look up by rowid to retrieve the auto-generated UUID.
  const [inserted] = db
    .select()
    .from(transactionCorrections)
    .where(sql`rowid = ${result.lastInsertRowid}`)
    .all();

  if (!inserted) {
    throw new NotFoundError("Correction", String(result.lastInsertRowid));
  }

  return inserted;
}

/**
 * Update an existing correction
 */
export function updateCorrection(id: string, input: UpdateCorrectionInput): CorrectionRow {
  const db = getDrizzle();
  const existing = getCorrection(id); // Throws if not found

  const updates: Partial<typeof transactionCorrections.$inferInsert> = {};
  let hasUpdates = false;

  if (input.entityId !== undefined) {
    updates.entityId = input.entityId;
    hasUpdates = true;
  }
  if (input.entityName !== undefined) {
    updates.entityName = input.entityName;
    hasUpdates = true;
  }
  if (input.location !== undefined) {
    updates.location = input.location;
    hasUpdates = true;
  }
  if (input.tags !== undefined) {
    updates.tags = JSON.stringify(input.tags);
    hasUpdates = true;
  }
  if (input.transactionType !== undefined) {
    updates.transactionType = input.transactionType;
    hasUpdates = true;
  }
  if (input.isActive !== undefined) {
    updates.isActive = input.isActive;
    hasUpdates = true;
  }
  if (input.confidence !== undefined) {
    updates.confidence = input.confidence;
    hasUpdates = true;
  }

  if (!hasUpdates) {
    return existing; // No changes
  }

  db.update(transactionCorrections).set(updates).where(eq(transactionCorrections.id, id)).run();

  return getCorrection(id);
}

/**
 * Delete a correction
 */
export function deleteCorrection(id: string): void {
  const db = getDrizzle();
  const result = db.delete(transactionCorrections).where(eq(transactionCorrections.id, id)).run();

  if (result.changes === 0) {
    throw new NotFoundError("Correction", id);
  }
}

/**
 * Increment usage stats for a correction
 */
export function incrementCorrectionUsage(id: string): void {
  const db = getDrizzle();
  db.update(transactionCorrections)
    .set({
      timesApplied: sql`${transactionCorrections.timesApplied} + 1`,
      lastUsedAt: new Date().toISOString(),
    })
    .where(eq(transactionCorrections.id, id))
    .run();
}

/**
 * Adjust confidence score
 */
export function adjustConfidence(id: string, delta: number): void {
  const db = getDrizzle();
  const existing = getCorrection(id);
  const newConfidence = Math.max(0, Math.min(1, existing.confidence + delta));

  db.update(transactionCorrections)
    .set({ confidence: newConfidence })
    .where(eq(transactionCorrections.id, id))
    .run();

  // Auto-delete if confidence too low
  if (newConfidence < 0.3) {
    deleteCorrection(id);
  }
}
