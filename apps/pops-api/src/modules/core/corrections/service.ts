/**
 * Transaction corrections service
 * Manages learned patterns from user edits — Drizzle ORM
 */
import Anthropic from '@anthropic-ai/sdk';
import { and, asc, count, desc, eq, gte, sql } from 'drizzle-orm';

import { aiUsage, settings, transactionCorrections, transactions } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { isNamedEnvContext } from '../../../db.js';
import { getEnv } from '../../../env.js';
import { withRateLimitRetry } from '../../../lib/ai-retry.js';
import { logger } from '../../../lib/logger.js';
import { NotFoundError } from '../../../shared/errors.js';
import { parseJsonStringArray } from '../../../shared/json.js';
import {
  applyChangeSetToRules,
  buildTargetRulesMap,
  computeImpactCounts,
  findMatchingCorrectionFromRules,
  mergeTags,
  outcomeChanged,
  outcomeFromMatch,
  ruleMatchesDescription,
} from './pure-service.js';
import {
  ChangeSetImpactSummarySchema,
  ChangeSetSchema,
  classifyCorrectionMatch,
  normalizeDescription,
} from './types.js';
import { AdaptedSignalSchema } from './types.js';

import type {
  ChangeSet,
  ChangeSetImpactItem,
  ChangeSetImpactSummary,
  ChangeSetOp,
  ChangeSetProposal,
  Correction,
  CorrectionClassificationOutcome,
  CorrectionMatchResult,
  CorrectionRow,
  CorrectionSignal,
  CreateCorrectionInput,
  UpdateCorrectionInput,
} from './types.js';

export * from './pure-service.js';

interface RejectedChangeSetFeedbackRecord {
  createdAt: string;
  userEmail: string;
  feedback: string;
  changeSet: ChangeSet;
  impactSummary: ChangeSetImpactSummary | null;
}

function feedbackKey(args: {
  matchType: 'exact' | 'contains' | 'regex';
  normalizedPattern: string;
}): string {
  return `corrections.changeSetRejections:${args.matchType}:${args.normalizedPattern}`;
}

function loadLatestRejectedFeedback(args: {
  matchType: 'exact' | 'contains' | 'regex';
  normalizedPattern: string;
}): RejectedChangeSetFeedbackRecord | null {
  const row =
    getDrizzle()
      .select()
      .from(settings)
      .where(eq(settings.key, feedbackKey(args)))
      .get() ?? null;
  if (!row) return null;

  try {
    const parsedUnknown = JSON.parse(row.value) as unknown;
    if (!parsedUnknown || typeof parsedUnknown !== 'object') return null;

    const parsed = parsedUnknown as Record<string, unknown>;

    const createdAt = parsed['createdAt'];
    const userEmail = parsed['userEmail'];
    const feedback = parsed['feedback'];
    const changeSetUnknown = parsed['changeSet'];
    const impactSummaryUnknown = parsed['impactSummary'];

    if (typeof createdAt !== 'string') return null;
    if (typeof userEmail !== 'string') return null;
    if (typeof feedback !== 'string') return null;

    const changeSetResult = ChangeSetSchema.safeParse(changeSetUnknown);
    if (!changeSetResult.success) return null;

    const impactSummaryResult = ChangeSetImpactSummarySchema.safeParse(impactSummaryUnknown);

    return {
      createdAt,
      userEmail,
      feedback,
      changeSet: changeSetResult.data,
      impactSummary: impactSummaryResult.success ? impactSummaryResult.data : null,
    };
  } catch {
    return null;
  }
}

export function persistRejectedChangeSetFeedback(args: {
  signal: CorrectionSignal;
  changeSet: ChangeSet;
  feedback: string;
  impactSummary: RejectedChangeSetFeedbackRecord['impactSummary'];
  userEmail: string;
}): void {
  const db = getDrizzle();
  const normalizedPattern = normalizeDescription(args.signal.descriptionPattern);

  // Latest-wins storage (overwrites previous record for the same key).
  const record: RejectedChangeSetFeedbackRecord = {
    createdAt: new Date().toISOString(),
    userEmail: args.userEmail,
    feedback: args.feedback,
    changeSet: args.changeSet,
    impactSummary: args.impactSummary,
  };

  db.insert(settings)
    .values({
      key: feedbackKey({ matchType: args.signal.matchType, normalizedPattern }),
      value: JSON.stringify(record),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(record) },
    })
    .run();
}

// Shared AI retry helper lives in src/lib/ai-retry.ts

export async function interpretRejectionFeedback(
  originalSignal: CorrectionSignal,
  rejectedChangeSet: ChangeSet,
  feedback: string
): Promise<CorrectionSignal> {
  // Named envs are isolated test databases — skip calling external AI.
  if (isNamedEnvContext()) {
    return originalSignal;
  }

  const apiKey = getEnv('CLAUDE_API_KEY');
  if (!apiKey) {
    return originalSignal;
  }

  const sanitizedFeedback = feedback.trim().slice(0, 500);

  // maxRetries=0: SDK-level retries disabled — we handle retries ourselves via withRateLimitRetry
  const client = new Anthropic({ apiKey, maxRetries: 0 });

  try {
    const response = await withRateLimitRetry(
      () =>
        client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 250,
          messages: [
            {
              role: 'user',
              content: `You are improving a transaction correction rule proposal.\n\nGiven:\n- originalSignal (the user's intended correction rule)\n- rejectedChangeSet (the proposal that was rejected)\n- feedback (free text)\n\nReturn an adapted signal that better matches the user's feedback.\n\nRules:\n- Reply in JSON only as: {"adaptedSignal": { ... }}\n- adaptedSignal MUST be a full signal object with keys: descriptionPattern, matchType, entityId, entityName, location, tags, transactionType.\n- Keep descriptionPattern semantically the same unless feedback explicitly requests changing it.\n- Prefer changing matchType (exact/contains/regex) when feedback indicates specificity.\n\noriginalSignal: ${JSON.stringify(originalSignal)}\nrejectedChangeSet: ${JSON.stringify(rejectedChangeSet)}\nfeedback: ${JSON.stringify(sanitizedFeedback)}\n`,
            },
          ],
        }),
      'corrections.rejection.interpret',
      { logger, logPrefix: '[AI]' }
    );

    const text = response.content[0]?.type === 'text' ? response.content[0].text : null;
    if (!text) return originalSignal;

    const cleanedText = text
      .trim()
      .replaceAll(/^```(?:json)?\s*\n?/gm, '')
      .replaceAll(/\n?```\s*$/gm, '');

    const parsed = JSON.parse(cleanedText) as unknown;
    if (!parsed || typeof parsed !== 'object') return originalSignal;
    const adaptedUnknown = (parsed as Record<string, unknown>)['adaptedSignal'];

    const adaptedResult = AdaptedSignalSchema.safeParse(adaptedUnknown);
    if (!adaptedResult.success) return originalSignal;

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd = (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0;

    getDrizzle()
      .insert(aiUsage)
      .values({
        description: sanitizedFeedback,
        entityName: null,
        category: 'corrections.rejection_interpretation',
        inputTokens,
        outputTokens,
        costUsd,
        cached: 0,
        importBatchId: null,
        createdAt: new Date().toISOString(),
      })
      .run();

    return adaptedResult.data;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      '[AI] Rejection feedback interpretation failed'
    );
    return originalSignal;
  }
}

/**
 * Revise an in-progress ChangeSet via a free-text instruction from the US-06 AI helper.
 *
 * The LLM is given:
 * - the triggering transactions for the current import session (scoped per PRD-028)
 * - the user's current ChangeSet
 * - a free-text instruction describing how to refine it
 * - the allowed op kinds and their JSON schemas
 *
 * It must return a complete revised ChangeSet plus a one-line rationale, as strict JSON.
 * Unlike {@link interpretRejectionFeedback}, this function does NOT silently fall back on
 * errors — callers need to know when the model failed so the dialog can surface the error.
 */
export async function reviseChangeSet(args: {
  signal: CorrectionSignal;
  currentChangeSet: ChangeSet;
  instruction: string;
  triggeringTransactions: Array<{ checksum?: string; description: string }>;
}): Promise<{
  changeSet: ChangeSet;
  rationale: string;
  targetRules: Record<string, Correction>;
}> {
  /**
   * Hydrate targetRules for any non-add op referenced by the final
   * ChangeSet. Done against a single snapshot of `transactionCorrections`
   * at the top of the call so the map is consistent with whichever
   * ChangeSet we ultimately return (passthrough or AI-revised).
   */
  const rulesBefore = getDrizzle().select().from(transactionCorrections).all();

  if (isNamedEnvContext()) {
    // Named envs are isolated test databases — skip external AI.
    // Return the ChangeSet unchanged with a neutral rationale so integration tests
    // can still exercise the endpoint shape.
    return {
      changeSet: args.currentChangeSet,
      rationale: 'Named env context — AI revision skipped',
      targetRules: buildTargetRulesMap(args.currentChangeSet, rulesBefore),
    };
  }

  const apiKey = getEnv('CLAUDE_API_KEY');
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY not configured');
  }

  const sanitizedInstruction = args.instruction.trim().slice(0, 2000);
  if (sanitizedInstruction.length === 0) {
    throw new Error('reviseChangeSet: instruction must be non-empty');
  }

  const triggeringLines = args.triggeringTransactions
    .slice(0, 100)
    .map((t, i) => `${i + 1}. "${t.description}"`)
    .join('\n');

  const currentChangeSetJson = JSON.stringify(args.currentChangeSet, null, 2);
  const signalJson = JSON.stringify(args.signal);

  const prompt = `You are refining a bundled correction rule ChangeSet for a personal finance app.

You are given:
- the triggering correction signal (the user's original intent)
- the user's current in-progress ChangeSet
- a list of triggering transactions from the current import session
- a free-text instruction from the user describing how to revise the ChangeSet

A ChangeSet is a bundle of rule operations. Each operation has one of four "op" kinds:

1. add     — { "op": "add",     "data": { "descriptionPattern": string, "matchType": "exact"|"contains"|"regex", "entityId"?: string|null, "entityName"?: string|null, "location"?: string|null, "tags"?: string[], "transactionType"?: "purchase"|"transfer"|"income"|null, "confidence"?: number, "isActive"?: boolean } }
2. edit    — { "op": "edit",    "id": string (existing rule id), "data": { same fields as add.data but all optional, no descriptionPattern/matchType } }
3. disable — { "op": "disable", "id": string (existing rule id) }
4. remove  — { "op": "remove",  "id": string (existing rule id) }

The ChangeSet wrapper is: { "source"?: string, "reason"?: string, "ops": Op[] } and MUST contain at least one op.

You may freely add, edit, split, merge, or remove any operation in the supplied ChangeSet — including operations the user manually added. Preserve any "id" values on edit/disable/remove ops unless the user explicitly asks to target a different rule. Do not invent rule ids that were not present in the input. Do not include tag rule learning. Patterns should be normalized to uppercase with digits stripped.

originalSignal: ${signalJson}

triggeringTransactions:
${triggeringLines || '(none provided)'}

currentChangeSet:
${currentChangeSetJson}

instruction: ${JSON.stringify(sanitizedInstruction)}

Return ONLY a single JSON object, no markdown, no explanation:
{"changeSet": <revised ChangeSet>, "rationale": "<one-line explanation>"}`;

  // maxRetries=0: SDK-level retries disabled — we handle retries ourselves via withRateLimitRetry
  const client = new Anthropic({ apiKey, maxRetries: 0 });

  let response;
  try {
    response = await withRateLimitRetry(
      () =>
        client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        }),
      'corrections.revise',
      { logger, logPrefix: '[AI]' }
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      '[AI] reviseChangeSet call failed'
    );
    throw new Error(
      `reviseChangeSet: AI call failed — ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  const text = response.content[0]?.type === 'text' ? response.content[0].text : null;
  if (!text) {
    throw new Error('reviseChangeSet: AI returned empty content');
  }

  const cleanedText = text
    .trim()
    .replaceAll(/^```(?:json)?\s*\n?/gm, '')
    .replaceAll(/\n?```\s*$/gm, '');

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanedText);
  } catch (error) {
    logger.error({ text: cleanedText }, '[AI] reviseChangeSet: failed to parse JSON');
    throw new Error(
      `reviseChangeSet: AI returned invalid JSON — ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('reviseChangeSet: AI response was not a JSON object');
  }

  const container = parsed as Record<string, unknown>;
  const changeSetResult = ChangeSetSchema.safeParse(container['changeSet']);
  if (!changeSetResult.success) {
    logger.error(
      { issues: changeSetResult.error.issues, raw: container['changeSet'] },
      '[AI] reviseChangeSet: ChangeSet failed schema validation'
    );
    throw new Error(
      `reviseChangeSet: AI returned a ChangeSet that failed schema validation — ${changeSetResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`
    );
  }

  const rationaleRaw = container['rationale'];
  const rationale =
    typeof rationaleRaw === 'string' && rationaleRaw.trim().length > 0
      ? rationaleRaw.trim()
      : 'ChangeSet revised by AI helper';

  // Best-effort AI usage tracking — matches interpretRejectionFeedback pattern.
  try {
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd = (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0;

    getDrizzle()
      .insert(aiUsage)
      .values({
        description: sanitizedInstruction,
        entityName: null,
        category: 'corrections.revise_changeset',
        inputTokens,
        outputTokens,
        costUsd,
        cached: 0,
        importBatchId: null,
        createdAt: new Date().toISOString(),
      })
      .run();
  } catch {
    // ai_usage tracking is best-effort — don't fail the request
  }

  return {
    changeSet: changeSetResult.data,
    rationale,
    targetRules: buildTargetRulesMap(changeSetResult.data, rulesBefore),
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
export async function proposeChangeSetFromCorrectionSignal(args: {
  signal: CorrectionSignal;
  minConfidence: number;
  maxPreviewItems: number;
}): Promise<ChangeSetProposal> {
  const db = getDrizzle();

  const normalizedPatternForLookup = normalizeDescription(args.signal.descriptionPattern);
  const latestFeedback = loadLatestRejectedFeedback({
    matchType: args.signal.matchType,
    normalizedPattern: normalizedPatternForLookup,
  });

  const effectiveSignal = latestFeedback
    ? await interpretRejectionFeedback(
        args.signal,
        latestFeedback.changeSet,
        latestFeedback.feedback
      )
    : args.signal;

  const normalizedPattern = normalizeDescription(effectiveSignal.descriptionPattern);
  const matchType = effectiveSignal.matchType;

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
        source: latestFeedback ? 'correction-signal-followup' : 'correction-signal',
        reason: latestFeedback
          ? `Follow-up proposal after rejection feedback: "${latestFeedback.feedback}"`
          : 'Update existing correction rule from user correction signal',
        ops: [
          {
            op: 'edit',
            id: existing.id,
            data: {
              entityId: effectiveSignal.entityId,
              entityName: effectiveSignal.entityName,
              location: effectiveSignal.location,
              tags: effectiveSignal.tags,
              transactionType: effectiveSignal.transactionType,
            },
          },
        ],
      }
    : {
        source: latestFeedback ? 'correction-signal-followup' : 'correction-signal',
        reason: latestFeedback
          ? `Follow-up proposal after rejection feedback: "${latestFeedback.feedback}"`
          : 'Create new correction rule from user correction signal',
        ops: [
          {
            op: 'add',
            data: {
              descriptionPattern: normalizedPattern,
              matchType,
              entityId: effectiveSignal.entityId ?? null,
              entityName: effectiveSignal.entityName ?? null,
              location: effectiveSignal.location ?? null,
              tags: effectiveSignal.tags ?? [],
              transactionType: effectiveSignal.transactionType ?? null,
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
    matchType === 'regex' ? sqlNormalizedDescription : sqlCollapsedSpaces;
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
      matchType === 'regex'
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
      tags: mergeTags(parseJsonStringArray(t.tags), beforeBase.tags).toSorted(),
    };
    const after: CorrectionClassificationOutcome = {
      ...afterBase,
      tags: mergeTags(parseJsonStringArray(t.tags), afterBase.tags).toSorted(),
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

  const baseRationale = existing
    ? `Edit correction rule ${existing.id} (${matchType}:${normalizedPattern}) based on correction signal`
    : `Add new correction rule (${matchType}:${normalizedPattern}) based on correction signal`;
  const rationale = latestFeedback
    ? `${baseRationale}. Follow-up after rejection feedback: "${latestFeedback.feedback}"`
    : baseRationale;

  return {
    changeSet,
    rationale,
    preview: {
      counts,
      affected,
    },
    targetRules: buildTargetRulesMap(changeSet, rulesBefore),
  };
}

export function applyChangeSet(changeSet: ChangeSet): CorrectionRow[] {
  const db = getDrizzle();

  return db.transaction((tx) => {
    // Deterministic ordering: add → edit → disable → remove
    const order: Record<ChangeSetOp['op'], number> = { add: 1, edit: 2, disable: 3, remove: 4 };
    const ops = [...changeSet.ops].toSorted((a, b) => order[a.op] - order[b.op]);

    for (const op of ops) {
      if (op.op === 'add') {
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
      if (!existing) throw new NotFoundError('Correction', op.id);

      if (op.op === 'edit') {
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

      if (op.op === 'disable') {
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
/**
 * Find all correction rules that match a description, ordered by priority ASC.
 * The first entry is the winner; subsequent entries are overridden alternatives.
 * Reads active rules from the database (DB path for the initial import pipeline).
 */
export function findAllMatchingCorrectionFromDB(
  description: string,
  minConfidence: number = 0.7
): CorrectionRow[] {
  const db = getDrizzle();
  const normalized = normalizeDescription(description);

  // Fetch all active eligible rules ordered by priority ASC, id ASC
  const candidates = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.isActive, true),
        gte(transactionCorrections.confidence, minConfidence)
      )
    )
    .orderBy(asc(transactionCorrections.priority), asc(transactionCorrections.id))
    .all();

  return candidates.filter((rule) => ruleMatchesDescription(rule, normalized));
}

export function findMatchingCorrection(
  description: string,
  minConfidence: number = 0.7
): CorrectionMatchResult | null {
  const allMatches = findAllMatchingCorrectionFromDB(description, minConfidence);
  const first = allMatches[0];
  if (!first) return null;
  return classifyCorrectionMatch(first);
}

/**
 * List all corrections with optional filters
 */
export function listCorrections(
  minConfidence?: number,
  limit: number = 50,
  offset: number = 0,
  matchType?: 'exact' | 'contains' | 'regex'
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
    throw new NotFoundError('Correction', id);
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
        eq(transactionCorrections.matchType, 'exact'),
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
        eq(transactionCorrections.matchType, 'contains'),
        sql`${normalized} LIKE '%' || ${transactionCorrections.descriptionPattern} || '%'`
      )
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .all();

  const regexCandidates = db
    .select()
    .from(transactionCorrections)
    .where(
      and(eq(transactionCorrections.isActive, true), eq(transactionCorrections.matchType, 'regex'))
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
        priority: input.priority ?? existing.priority,
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
      priority: input.priority ?? 0,
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
    throw new NotFoundError('Correction', String(result.lastInsertRowid));
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
  if (input.priority !== undefined) {
    updates.priority = input.priority;
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
    throw new NotFoundError('Correction', id);
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
