import Anthropic from '@anthropic-ai/sdk';

import { getEnv } from '../../../../env.js';
import { withRateLimitRetry } from '../../../../lib/ai-retry.js';
import { trackInference } from '../../../../lib/inference-middleware.js';
import { logger } from '../../../../lib/logger.js';
import { getSettingValue } from '../../settings/service.js';
import { patternMatchesDescription } from './pattern-match.js';

function getRuleGenModel(): string {
  return getSettingValue('finance.ruleGen.model', 'claude-haiku-4-5-20251001');
}

function getRuleGenMaxTokens(): number {
  return getSettingValue('finance.ruleGen.maxTokens', 200);
}

export interface CorrectionInput {
  description: string;
  entityName: string;
  amount: number;
}

export interface CorrectionAnalysis {
  matchType: 'exact' | 'contains' | 'regex';
  pattern: string;
  confidence: number;
}

function getMinPatternLength(): number {
  return getSettingValue('core.corrections.minPatternLength', 3);
}

function buildAnalyzePrompt(input: CorrectionInput): string {
  return `You are a bank transaction pattern analyzer. A user has assigned a transaction to an entity and we need a reusable rule that will identify FUTURE transactions belonging to the same entity.

Transaction description: "${input.description}"
Entity (context only — may not appear in the description): "${input.entityName}"
Amount: ${input.amount}

Your job is to answer: **how would we recognise future transactions for this entity?**

Hard rules — read carefully:
1. The rule MUST match the transaction description shown above. Verify before answering.
2. The entity name is context only. Do NOT put the entity name into the pattern unless it literally appears (case-insensitive) in the description. If it does not appear, derive the pattern entirely from the description.
3. Pick any stable identifier you can find in the description: a merchant/company name, a recurring keyword, a payment-processor token, an invoice prefix, or — if nothing shorter is reliable — the entire description verbatim. Prefer the shortest stable substring, but a longer pattern (or the full description) is acceptable when no shorter identifier is reliable.
4. Strip volatile parts: numeric codes, branch IDs, dates, dollar amounts, and trailing reference numbers. Keep alphabetic merchant tokens.

Return a single JSON object:
- "matchType": one of:
  - "exact"   — the full normalized description is the identifier
  - "contains" — the pattern is a substring of the description (preferred default)
  - "regex"   — a regular expression that will match this and similar descriptions; use only when neither exact nor a literal substring is sufficient
- "pattern": the matching pattern string (min ${getMinPatternLength()} chars, uppercase). For "exact" and "contains" the pattern must appear verbatim (case-insensitive) inside the description. For "regex" the pattern must be a valid JavaScript regular expression that tests true against the description.
- "confidence": 0.0-1.0 (how confident you are this rule correctly identifies future transactions for this entity)

Examples:
- description "IKEA TEMPE NSW", entity "IKEA"            → {"matchType":"contains","pattern":"IKEA","confidence":0.95}
- description "PAYMENT TO NETFLIX", entity "Netflix"       → {"matchType":"contains","pattern":"NETFLIX","confidence":0.95}
- description "WOOLWORTHS 1234 SYDNEY", entity "Woolworths"→ {"matchType":"contains","pattern":"WOOLWORTHS","confidence":0.95}
- description "MEMBERSHIP FEE", entity "American Express"  → {"matchType":"exact","pattern":"MEMBERSHIP FEE","confidence":0.7}
  (entity name does NOT appear in description → use the description itself as the identifier)
- description "DD AMEX 4521", entity "American Express"    → {"matchType":"contains","pattern":"AMEX","confidence":0.85}
  ("AMEX" is in the description, so it is a valid stable identifier)

Return ONLY the JSON object, no markdown, no explanation.`;
}

async function callClaude(prompt: string, apiKey: string): Promise<string | null> {
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  let response;
  try {
    response = await trackInference(
      { provider: 'claude', model: getRuleGenModel(), operation: 'rule-generation' },
      () =>
        withRateLimitRetry(
          () =>
            client.messages.create({
              model: getRuleGenModel(),
              max_tokens: getRuleGenMaxTokens(),
              messages: [{ role: 'user', content: prompt }],
            }),
          'analyzeCorrection',
          { logger, logPrefix: '[RuleGen]' }
        )
    );
  } catch (error) {
    logger.error({ error }, '[RuleGen] AI call failed for correction analysis');
    return null;
  }

  return response.content[0]?.type === 'text' ? response.content[0].text : null;
}

function parseAnalysis(text: string): CorrectionAnalysis | null {
  const cleanedText = text
    .trim()
    .replaceAll(/^```(?:json)?\s*\n?/gm, '')
    .replaceAll(/\n?```\s*$/gm, '');

  try {
    const parsed = JSON.parse(cleanedText) as Record<string, unknown>;
    const rawMatchType = parsed['matchType'];
    const rawPattern = parsed['pattern'];
    const rawConfidence = parsed['confidence'];

    const matchType = typeof rawMatchType === 'string' ? rawMatchType : '';
    const pattern = typeof rawPattern === 'string' ? rawPattern : '';
    const confidence = typeof rawConfidence === 'number' ? rawConfidence : 0;

    if (
      !['exact', 'contains', 'regex'].includes(matchType) ||
      pattern.length < getMinPatternLength() ||
      confidence < 0 ||
      confidence > 1
    ) {
      logger.warn({ parsed }, '[RuleGen] Invalid correction analysis response');
      return null;
    }

    return {
      matchType: matchType as CorrectionAnalysis['matchType'],
      pattern,
      confidence,
    };
  } catch {
    logger.error({ text: cleanedText }, '[RuleGen] Failed to parse correction analysis response');
    return null;
  }
}

export async function analyzeCorrection(
  input: CorrectionInput
): Promise<CorrectionAnalysis | null> {
  const apiKey = getEnv('CLAUDE_API_KEY');
  if (!apiKey) {
    logger.warn('[RuleGen] CLAUDE_API_KEY not configured — skipping correction analysis');
    return null;
  }

  const text = await callClaude(buildAnalyzePrompt(input), apiKey);
  if (!text) return null;

  const result = parseAnalysis(text);
  if (!result) return null;

  if (!patternMatchesDescription(result.pattern, result.matchType, input.description)) {
    logger.warn(
      { result, description: input.description },
      '[RuleGen] AI proposed pattern does not match the triggering description — rejecting'
    );
    return null;
  }

  logger.info({ result }, '[RuleGen] Correction analysis complete');
  return result;
}
