import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';

import { settings } from '@pops/db-types';

import { getDrizzle, isNamedEnvContext } from '../../../../db.js';
import { withRateLimitRetry } from '../../../../lib/ai-retry.js';
import { getAnthropicApiKey } from '../../../../lib/anthropic-api-key.js';
import { trackInference } from '../../../../lib/inference-middleware.js';
import { logger } from '../../../../lib/logger.js';
import {
  AdaptedSignalSchema,
  ChangeSetImpactSummarySchema,
  ChangeSetSchema,
  normalizeDescription,
} from '../types.js';

import type { ChangeSet, ChangeSetImpactSummary, CorrectionSignal } from '../types.js';

export { reviseChangeSet } from './ai-revise.js';

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

function parseFeedbackRecord(value: string): RejectedChangeSetFeedbackRecord | null {
  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(value) as unknown;
  } catch {
    return null;
  }
  if (!parsedUnknown || typeof parsedUnknown !== 'object') return null;

  const parsed = parsedUnknown as Record<string, unknown>;
  const { createdAt, userEmail, feedback } = parsed;

  if (typeof createdAt !== 'string') return null;
  if (typeof userEmail !== 'string') return null;
  if (typeof feedback !== 'string') return null;

  const changeSetResult = ChangeSetSchema.safeParse(parsed['changeSet']);
  if (!changeSetResult.success) return null;

  const impactSummaryResult = ChangeSetImpactSummarySchema.safeParse(parsed['impactSummary']);

  return {
    createdAt,
    userEmail,
    feedback,
    changeSet: changeSetResult.data,
    impactSummary: impactSummaryResult.success ? impactSummaryResult.data : null,
  };
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
  return parseFeedbackRecord(row.value);
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

function buildInterpretPrompt(
  originalSignal: CorrectionSignal,
  rejectedChangeSet: ChangeSet,
  sanitizedFeedback: string
): string {
  return `You are improving a transaction correction rule proposal.

Given:
- originalSignal (the user's intended correction rule)
- rejectedChangeSet (the proposal that was rejected)
- feedback (free text)

Return an adapted signal that better matches the user's feedback.

Rules:
- Reply in JSON only as: {"adaptedSignal": { ... }}
- adaptedSignal MUST be a full signal object with keys: descriptionPattern, matchType, entityId, entityName, location, tags, transactionType.
- Keep descriptionPattern semantically the same unless feedback explicitly requests changing it.
- Prefer changing matchType (exact/contains/regex) when feedback indicates specificity.

originalSignal: ${JSON.stringify(originalSignal)}
rejectedChangeSet: ${JSON.stringify(rejectedChangeSet)}
feedback: ${JSON.stringify(sanitizedFeedback)}
`;
}

function parseAdaptedSignal(text: string, originalSignal: CorrectionSignal): CorrectionSignal {
  const cleanedText = text
    .trim()
    .replaceAll(/^```(?:json)?\s*\n?/gm, '')
    .replaceAll(/\n?```\s*$/gm, '');

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanedText);
  } catch {
    return originalSignal;
  }
  if (!parsed || typeof parsed !== 'object') return originalSignal;
  const adaptedUnknown = (parsed as Record<string, unknown>)['adaptedSignal'];
  const adaptedResult = AdaptedSignalSchema.safeParse(adaptedUnknown);
  return adaptedResult.success ? adaptedResult.data : originalSignal;
}

export async function interpretRejectionFeedback(
  originalSignal: CorrectionSignal,
  rejectedChangeSet: ChangeSet,
  feedback: string
): Promise<CorrectionSignal> {
  if (isNamedEnvContext()) return originalSignal;

  const apiKey = getAnthropicApiKey();
  if (!apiKey) return originalSignal;

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
                  content: buildInterpretPrompt(
                    originalSignal,
                    rejectedChangeSet,
                    sanitizedFeedback
                  ),
                },
              ],
            }),
          'corrections.rejection.interpret',
          { logger, logPrefix: '[AI]' }
        )
    );

    const text = response.content[0]?.type === 'text' ? response.content[0].text : null;
    if (!text) return originalSignal;
    return parseAdaptedSignal(text, originalSignal);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      '[AI] Rejection feedback interpretation failed'
    );
    return originalSignal;
  }
}
