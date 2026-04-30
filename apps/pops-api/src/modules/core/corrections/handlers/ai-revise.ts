import Anthropic from '@anthropic-ai/sdk';

import { transactionCorrections } from '@pops/db-types';

import { getDrizzle, isNamedEnvContext } from '../../../../db.js';
import { withRateLimitRetry } from '../../../../lib/ai-retry.js';
import { getAnthropicApiKey } from '../../../../lib/anthropic-api-key.js';
import { trackInference } from '../../../../lib/inference-middleware.js';
import { logger } from '../../../../lib/logger.js';
import { buildTargetRulesMap } from '../pure-service.js';
import { ChangeSetSchema } from '../types.js';

import type { ChangeSet, Correction, CorrectionSignal } from '../types.js';

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

function buildPrompt(args: ReviseArgs, sanitizedInstruction: string): string {
  const triggeringLines = args.triggeringTransactions
    .slice(0, 100)
    .map((t, i) => `${i + 1}. "${t.description}"`)
    .join('\n');

  const currentChangeSetJson = JSON.stringify(args.currentChangeSet, null, 2);
  const signalJson = JSON.stringify(args.signal);

  return `You are refining a bundled correction rule ChangeSet for a personal finance app.

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
}

async function callClaude(prompt: string, apiKey: string): Promise<string> {
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
  if (!text) throw new Error('reviseChangeSet: AI returned empty content');
  return text;
}

function parseAndValidate(text: string): { changeSet: ChangeSet; rationale: string } {
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

  return { changeSet: changeSetResult.data, rationale };
}

export async function reviseChangeSet(args: ReviseArgs): Promise<ReviseResult> {
  const rulesBefore = getDrizzle().select().from(transactionCorrections).all();

  if (isNamedEnvContext()) {
    return {
      changeSet: args.currentChangeSet,
      rationale: 'Named env context — AI revision skipped',
      targetRules: buildTargetRulesMap(args.currentChangeSet, rulesBefore),
    };
  }

  const apiKey = getAnthropicApiKey();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const sanitizedInstruction = args.instruction.trim().slice(0, 2000);
  if (sanitizedInstruction.length === 0) {
    throw new Error('reviseChangeSet: instruction must be non-empty');
  }

  const prompt = buildPrompt(args, sanitizedInstruction);
  const text = await callClaude(prompt, apiKey);
  const { changeSet, rationale } = parseAndValidate(text);

  return { changeSet, rationale, targetRules: buildTargetRulesMap(changeSet, rulesBefore) };
}
