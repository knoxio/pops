/**
 * LLM-powered rule generator for transaction tagging corrections.
 * Calls Claude Haiku with a batch of transactions to propose reusable tagging rules.
 * Uses the same withRateLimitRetry / ai_usage tracking pattern as ai-categorizer.ts.
 */
import Anthropic from '@anthropic-ai/sdk';
import { aiUsage, transactions as transactionsTable } from '@pops/db-types';
import { and, isNotNull, ne } from 'drizzle-orm';

import { getDrizzle } from '../../../../db.js';
import { getEnv } from '../../../../env.js';
import { withRateLimitRetry } from '../../../../lib/ai-retry.js';
import { logger } from '../../../../lib/logger.js';
import { normalizeDescription } from '../types.js';

/**
 * Load all distinct tag values from existing transactions.
 * Used to inform LLM prompts with real tags from the database.
 */
/** Parse a JSON tags column value into an array of trimmed tag strings. */
function parseTagsColumn(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      .map((t) => t.trim());
  } catch {
    // malformed JSON — ignore
    return [];
  }
}

function loadAvailableTagsFromDb(): string[] {
  try {
    const rows = getDrizzle()
      .select({ tags: transactionsTable.tags })
      .from(transactionsTable)
      .where(and(isNotNull(transactionsTable.tags), ne(transactionsTable.tags, '[]')))
      .all();

    const tagSet = new Set<string>();
    for (const row of rows) {
      for (const tag of parseTagsColumn(row.tags)) {
        tagSet.add(tag);
      }
    }
    return [...tagSet].sort();
  } catch {
    return [];
  }
}

export interface ProposedRule {
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  tags: string[];
  reasoning: string;
}

export interface CorrectionAnalysis {
  matchType: 'exact' | 'contains' | 'regex';
  pattern: string;
  confidence: number;
}

/**
 * Verify that a proposed (pattern, matchType) actually matches the original
 * description after normalization. Mirrors the semantics of
 * `findMatchingCorrectionFromRules` so that anything we accept here will
 * match the triggering transaction at apply time.
 *
 * Pure helper — exported for unit testing.
 */
export function patternMatchesDescription(
  pattern: string,
  matchType: 'exact' | 'contains' | 'regex',
  description: string
): boolean {
  const normalizedDescription = normalizeDescription(description);
  // Patterns are stored normalized in the DB; mirror that here so the
  // validation matches what would actually persist.
  const normalizedPattern = matchType === 'regex' ? pattern : normalizeDescription(pattern);

  if (normalizedPattern.length === 0) return false;

  if (matchType === 'exact') {
    return normalizedPattern === normalizedDescription;
  }

  if (matchType === 'contains') {
    return normalizedDescription.includes(normalizedPattern);
  }

  // regex
  try {
    return new RegExp(normalizedPattern).test(normalizedDescription);
  } catch {
    return false;
  }
}

interface CorrectionInput {
  description: string;
  entityName: string;
  amount: number;
}

interface TransactionInput {
  description: string;
  entityName: string | null;
  amount: number;
  account: string;
  currentTags: string[];
}

// Shared AI retry helper lives in src/lib/ai-retry.ts

/**
 * Generate proposed tagging correction rules from a batch of transactions.
 * Returns proposals without saving — caller must confirm via corrections.createOrUpdate.
 */
export async function generateRules(transactions: TransactionInput[]): Promise<ProposedRule[]> {
  const apiKey = getEnv('CLAUDE_API_KEY');
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY not configured');
  }

  const client = new Anthropic({ apiKey, maxRetries: 0 });

  const transactionLines = transactions
    .map((t, i) => {
      const entity = t.entityName ?? 'unknown';
      const tags = t.currentTags.length > 0 ? t.currentTags.join(', ') : 'none';
      return `${i + 1}. "${t.description}" | entity: ${entity} | amount: ${t.amount} | account: ${t.account} | current tags: ${tags}`;
    })
    .join('\n');

  const availableTags = loadAvailableTagsFromDb();
  const tagListStr =
    availableTags.length > 0 ? availableTags.join(', ') : 'common financial categories';

  const prompt = `You are a transaction categorization assistant. Given these bank transactions, propose reusable tagging rules that could apply to similar transactions in the future.

Available tags: ${tagListStr}

Transactions:
${transactionLines}

Return a JSON array of proposed rules. Each rule should:
- Have a short description_pattern (the key merchant/description fragment to match)
- Specify match_type: "exact" (full normalized match), "contains" (pattern appears in description), or "regex"
- List relevant tags from the available tags list
- Include brief reasoning

Format:
[{"descriptionPattern":"...","matchType":"exact|contains|regex","tags":["Tag1","Tag2"],"reasoning":"..."}]

Return ONLY the JSON array, no markdown, no explanation.`;

  const response = await withRateLimitRetry(
    () =>
      client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    'generateRules',
    { logger, logPrefix: '[RuleGen]' }
  );

  const text = response.content[0]?.type === 'text' ? response.content[0].text : null;
  if (!text) return [];

  const cleanedText = text
    .trim()
    .replace(/^```(?:json)?\s*\n?/gm, '')
    .replace(/\n?```\s*$/gm, '');

  let proposals: ProposedRule[];
  try {
    const parsed = JSON.parse(cleanedText) as unknown;
    if (!Array.isArray(parsed)) return [];

    proposals = parsed
      .filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === 'object' && !Array.isArray(item)
      )
      .map((item) => ({
        descriptionPattern:
          typeof item['descriptionPattern'] === 'string' ? item['descriptionPattern'] : '',
        matchType: (['exact', 'contains', 'regex'].includes(String(item['matchType']))
          ? item['matchType']
          : 'contains') as 'exact' | 'contains' | 'regex',
        tags: Array.isArray(item['tags'])
          ? (item['tags'] as unknown[]).filter((t): t is string => typeof t === 'string')
          : [],
        reasoning: typeof item['reasoning'] === 'string' ? item['reasoning'] : '',
      }))
      .filter((p) => p.descriptionPattern.length > 0);
  } catch {
    logger.error({ text: cleanedText }, '[RuleGen] Failed to parse LLM response');
    return [];
  }

  // Track AI usage
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd = (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0;

  try {
    getDrizzle()
      .insert(aiUsage)
      .values({
        description: `generateRules (${transactions.length} transactions)`,
        entityName: null,
        category: 'rule-generation',
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

  logger.info(
    { count: proposals.length, inputTokens, outputTokens, costUsd: costUsd.toFixed(6) },
    '[RuleGen] Generated rules'
  );

  return proposals;
}

const MIN_PATTERN_LENGTH = 3;

/**
 * Analyze a single user correction to suggest a matching pattern.
 * Returns null if AI is unavailable or the suggestion is invalid.
 */
export async function analyzeCorrection(
  input: CorrectionInput
): Promise<CorrectionAnalysis | null> {
  const apiKey = getEnv('CLAUDE_API_KEY');
  if (!apiKey) {
    logger.warn('[RuleGen] CLAUDE_API_KEY not configured — skipping correction analysis');
    return null;
  }

  const client = new Anthropic({ apiKey, maxRetries: 0 });

  const prompt = `You are a bank transaction pattern analyzer. A user has assigned a transaction to an entity and we need a reusable rule that will identify FUTURE transactions belonging to the same entity.

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
- "pattern": the matching pattern string (min ${MIN_PATTERN_LENGTH} chars, uppercase). For "exact" and "contains" the pattern must appear verbatim (case-insensitive) inside the description. For "regex" the pattern must be a valid JavaScript regular expression that tests true against the description.
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

  let response;
  try {
    response = await withRateLimitRetry(
      () =>
        client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{ role: 'user', content: prompt }],
        }),
      'analyzeCorrection',
      { logger, logPrefix: '[RuleGen]' }
    );
  } catch (error) {
    logger.error({ error }, '[RuleGen] AI call failed for correction analysis');
    return null;
  }

  const text = response.content[0]?.type === 'text' ? response.content[0].text : null;
  if (!text) return null;

  const cleanedText = text
    .trim()
    .replace(/^```(?:json)?\s*\n?/gm, '')
    .replace(/\n?```\s*$/gm, '');

  let result: CorrectionAnalysis | null;
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
      pattern.length < MIN_PATTERN_LENGTH ||
      confidence < 0 ||
      confidence > 1
    ) {
      logger.warn({ parsed }, '[RuleGen] Invalid correction analysis response');
      return null;
    }

    const typedMatchType = matchType as 'exact' | 'contains' | 'regex';

    // Defence in depth: the rule MUST match the triggering description.
    // Catches AI hallucinations (e.g. echoing the entity name when it isn't in
    // the description) and bad regexes — anything we accept here will also
    // match at apply time via findMatchingCorrectionFromRules.
    if (!patternMatchesDescription(pattern, typedMatchType, input.description)) {
      logger.warn(
        { parsed, description: input.description },
        '[RuleGen] AI proposed pattern does not match the triggering description — rejecting'
      );
      return null;
    }

    result = {
      matchType: typedMatchType,
      pattern,
      confidence,
    };
  } catch {
    logger.error({ text: cleanedText }, '[RuleGen] Failed to parse correction analysis response');
    return null;
  }

  // Track AI usage
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd = (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0;

  try {
    getDrizzle()
      .insert(aiUsage)
      .values({
        description: `analyzeCorrection: "${input.description}" → "${input.entityName}"`,
        entityName: input.entityName,
        category: 'correction-analysis',
        inputTokens,
        outputTokens,
        costUsd,
        cached: 0,
        importBatchId: null,
        createdAt: new Date().toISOString(),
      })
      .run();
  } catch {
    // ai_usage tracking is best-effort
  }

  logger.info(
    { result, inputTokens, outputTokens, costUsd: costUsd.toFixed(6) },
    '[RuleGen] Correction analysis complete'
  );

  return result;
}
