import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';

import { settings, transactionCorrections } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { isNamedEnvContext } from '../../../../db.js';
import { getEnv } from '../../../../env.js';
import { withRateLimitRetry } from '../../../../lib/ai-retry.js';
import { trackInference } from '../../../../lib/inference-middleware.js';
import { logger } from '../../../../lib/logger.js';
import { buildTargetRulesMap } from '../pure-service.js';
import { ChangeSetImpactSummarySchema, ChangeSetSchema, normalizeDescription } from '../types.js';
import { AdaptedSignalSchema } from '../types.js';

import type { ChangeSet, ChangeSetImpactSummary, Correction, CorrectionSignal } from '../types.js';

export interface RejectedChangeSetFeedbackRecord {
  createdAt: string;
  userEmail: string;
  feedback: string;
  changeSet: ChangeSet;
  impactSummary: ChangeSetImpactSummary | null;
}

export function feedbackKey(args: {
  matchType: 'exact' | 'contains' | 'regex';
  normalizedPattern: string;
}): string {
  return `corrections.changeSetRejections:${args.matchType}:${args.normalizedPattern}`;
}

export function loadLatestRejectedFeedback(args: {
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

export async function interpretRejectionFeedback(
  originalSignal: CorrectionSignal,
  rejectedChangeSet: ChangeSet,
  feedback: string
): Promise<CorrectionSignal> {
  if (isNamedEnvContext()) {
    return originalSignal;
  }

  const apiKey = getEnv('CLAUDE_API_KEY');
  if (!apiKey) {
    return originalSignal;
  }

  const sanitizedFeedback = feedback.trim().slice(0, 500);

  const client = new Anthropic({ apiKey, maxRetries: 0 });

  try {
    const response = await trackInference(
      { provider: 'claude', model: 'claude-haiku-4-5-20251001', operation: 'rejection-interpret' },
      () =>
        withRateLimitRetry(
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
        )
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

    return adaptedResult.data;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      '[AI] Rejection feedback interpretation failed'
    );
    return originalSignal;
  }
}

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
  const rulesBefore = getDrizzle().select().from(transactionCorrections).all();

  if (isNamedEnvContext()) {
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

  const client = new Anthropic({ apiKey, maxRetries: 0 });

  let response;
  try {
    response = await trackInference(
      { provider: 'claude', model: 'claude-haiku-4-5-20251001', operation: 'revise-changeset' },
      () =>
        withRateLimitRetry(
          () =>
            client.messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 2000,
              messages: [{ role: 'user', content: prompt }],
            }),
          'corrections.revise',
          { logger, logPrefix: '[AI]' }
        )
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

  return {
    changeSet: changeSetResult.data,
    rationale,
    targetRules: buildTargetRulesMap(changeSetResult.data, rulesBefore),
  };
}
