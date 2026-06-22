/**
 * `proposeChangeSet` (signal → add/edit ChangeSet + DB-scanned impact, adapting
 * to prior rejection feedback) and `reviseChangeSet` (free-text AI revision).
 * Ported from the monolith `core/corrections/handlers/{compute-changeset,ai-revise}.ts`.
 */
import { and, eq } from 'drizzle-orm';

import { ChangeSetSchema, type ChangeSet } from '../../../contract/rest-corrections.js';
import {
  type FinanceDb,
  transactionCorrections,
  transactionCorrectionsService,
} from '../../../db/index.js';
import { interpretRejectionFeedback, loadLatestRejectedFeedback } from './ai-feedback.js';
import { getClaudeCompleter } from './ai-runtime.js';
import {
  buildTargetRulesMap,
  type ChangeSetProposal,
  type Correction,
  type CorrectionSignal,
} from './ai-types.js';
import { buildAddChangeSet, buildEditChangeSet } from './changeset-builders.js';
import { computeChangeSetImpact } from './changeset-impact.js';
import { type CorrectionRow } from './types.js';

const { normalizeDescription } = transactionCorrectionsService;

interface FeedbackInfo {
  changeSet: ChangeSet;
  feedback: string;
}

async function resolveEffectiveSignal(
  db: FinanceDb,
  signal: CorrectionSignal
): Promise<{ effectiveSignal: CorrectionSignal; feedback: FeedbackInfo | null }> {
  const latest = await loadLatestRejectedFeedback(db, {
    matchType: signal.matchType,
    normalizedPattern: normalizeDescription(signal.descriptionPattern),
  });
  if (!latest) return { effectiveSignal: signal, feedback: null };
  const effectiveSignal = await interpretRejectionFeedback(
    signal,
    latest.changeSet,
    latest.feedback
  );
  return { effectiveSignal, feedback: { changeSet: latest.changeSet, feedback: latest.feedback } };
}

function findExistingRule(
  db: FinanceDb,
  matchType: 'exact' | 'contains' | 'regex',
  normalizedPattern: string
): CorrectionRow | undefined {
  return db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.matchType, matchType),
        eq(transactionCorrections.descriptionPattern, normalizedPattern)
      )
    )
    .get();
}

function describeRationale(
  existing: CorrectionRow | undefined,
  matchType: string,
  normalizedPattern: string,
  feedback: FeedbackInfo | null
): string {
  const base = existing
    ? `Edit correction rule ${existing.id} (${matchType}:${normalizedPattern}) based on correction signal`
    : `Add new correction rule (${matchType}:${normalizedPattern}) based on correction signal`;
  return feedback ? `${base}. Follow-up after rejection feedback: "${feedback.feedback}"` : base;
}

export interface ProposeArgs {
  signal: CorrectionSignal;
  minConfidence: number;
  maxPreviewItems: number;
}

export async function proposeChangeSetFromCorrectionSignal(
  db: FinanceDb,
  args: ProposeArgs
): Promise<ChangeSetProposal> {
  const { effectiveSignal, feedback } = await resolveEffectiveSignal(db, args.signal);
  const normalizedPattern = normalizeDescription(effectiveSignal.descriptionPattern);
  const matchType = effectiveSignal.matchType;
  const existing = findExistingRule(db, matchType, normalizedPattern);

  const builderArgs = {
    effectiveSignal,
    normalizedPattern,
    matchType,
    hasFeedback: feedback !== null,
    feedback: feedback?.feedback,
  };
  const changeSet = existing
    ? buildEditChangeSet(existing, builderArgs)
    : buildAddChangeSet(builderArgs);

  const impact = computeChangeSetImpact(db, {
    changeSet,
    matchType,
    normalizedPattern,
    minConfidence: args.minConfidence,
    maxPreviewItems: args.maxPreviewItems,
  });

  return {
    changeSet,
    rationale: describeRationale(existing, matchType, normalizedPattern, feedback),
    preview: { counts: impact.counts, affected: impact.affected },
    targetRules: buildTargetRulesMap(changeSet, impact.rulesBefore),
  };
}

export interface ReviseArgs {
  signal: CorrectionSignal;
  currentChangeSet: ChangeSet;
  instruction: string;
  triggeringTransactions: { checksum?: string; description: string }[];
}

export interface ReviseResult {
  changeSet: ChangeSet;
  rationale: string;
  targetRules: Record<string, Correction>;
}

function buildRevisePrompt(args: ReviseArgs, sanitizedInstruction: string): string {
  const triggeringLines = args.triggeringTransactions
    .slice(0, 100)
    .map((t, i) => `${i + 1}. "${t.description}"`)
    .join('\n');
  return `You are refining a bundled correction-rule ChangeSet for a personal finance app.

A ChangeSet is { "source"?: string, "reason"?: string, "ops": Op[] } with at least one op. Each op is one of:
- { "op": "add", "data": { "descriptionPattern": string, "matchType": "exact"|"contains"|"regex", "entityId"?, "entityName"?, "location"?, "tags"?, "transactionType"?, "confidence"?, "isActive"? } }
- { "op": "edit", "id": string, "data": { same fields, all optional, no descriptionPattern/matchType } }
- { "op": "disable", "id": string }
- { "op": "remove", "id": string }
Preserve existing ids on edit/disable/remove; do not invent ids. Normalize patterns to uppercase with digits stripped.

originalSignal: ${JSON.stringify(args.signal)}

triggeringTransactions:
${triggeringLines || '(none provided)'}

currentChangeSet:
${JSON.stringify(args.currentChangeSet, null, 2)}

instruction: ${JSON.stringify(sanitizedInstruction)}

Return ONLY: {"changeSet": <revised ChangeSet>, "rationale": "<one-line explanation>"}`;
}

function parseReviseResult(text: string): { changeSet: ChangeSet; rationale: string } {
  const cleaned = text
    .trim()
    .replaceAll(/^```(?:json)?\s*\n?/gm, '')
    .replaceAll(/\n?```\s*$/gm, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (cause) {
    throw new Error('reviseChangeSet: AI returned invalid JSON', { cause });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('reviseChangeSet: AI response was not a JSON object');
  }
  const container = parsed as Record<string, unknown>;
  const changeSet = ChangeSetSchema.safeParse(container['changeSet']);
  if (!changeSet.success) {
    throw new Error('reviseChangeSet: AI returned a ChangeSet that failed schema validation');
  }
  const rationaleRaw = container['rationale'];
  const rationale =
    typeof rationaleRaw === 'string' && rationaleRaw.trim().length > 0
      ? rationaleRaw.trim()
      : 'ChangeSet revised by AI helper';
  return { changeSet: changeSet.data, rationale };
}

export async function reviseChangeSet(db: FinanceDb, args: ReviseArgs): Promise<ReviseResult> {
  const rulesBefore = db.select().from(transactionCorrections).all();
  const sanitizedInstruction = args.instruction.trim().slice(0, 2000);
  if (sanitizedInstruction.length === 0)
    throw new Error('reviseChangeSet: instruction must be non-empty');

  const text = await getClaudeCompleter()({
    prompt: buildRevisePrompt(args, sanitizedInstruction),
    maxTokens: 2000,
    operation: 'revise-changeset',
  });
  if (!text) throw new Error('reviseChangeSet: AI unavailable');

  const { changeSet, rationale } = parseReviseResult(text);
  return { changeSet, rationale, targetRules: buildTargetRulesMap(changeSet, rulesBefore) };
}
