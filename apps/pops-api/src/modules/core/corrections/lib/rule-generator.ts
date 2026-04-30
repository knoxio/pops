/**
 * LLM-powered rule generator for transaction tagging corrections.
 * Calls Claude Haiku with a batch of transactions to propose reusable tagging rules.
 */
import Anthropic from '@anthropic-ai/sdk';

import { withRateLimitRetry } from '../../../../lib/ai-retry.js';
import { getAnthropicApiKey } from '../../../../lib/anthropic-api-key.js';
import { trackInference } from '../../../../lib/inference-middleware.js';
import { logger } from '../../../../lib/logger.js';
import { loadAvailableTagsFromDb } from './tag-loader.js';

export { analyzeCorrection } from './analyze-correction.js';
export type { CorrectionAnalysis, CorrectionInput } from './analyze-correction.js';
export { patternMatchesDescription } from './pattern-match.js';

export interface ProposedRule {
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  tags: string[];
  reasoning: string;
}

interface TransactionInput {
  description: string;
  entityName: string | null;
  amount: number;
  account: string;
  currentTags: string[];
}

function buildPrompt(transactions: TransactionInput[]): string {
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

  return `You are a transaction categorization assistant. Given these bank transactions, propose reusable tagging rules that could apply to similar transactions in the future.

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
}

function parseProposals(text: string): ProposedRule[] {
  const cleanedText = text
    .trim()
    .replaceAll(/^```(?:json)?\s*\n?/gm, '')
    .replaceAll(/\n?```\s*$/gm, '');

  try {
    const parsed = JSON.parse(cleanedText) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
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
}

export async function generateRules(transactions: TransactionInput[]): Promise<ProposedRule[]> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const client = new Anthropic({ apiKey, maxRetries: 0 });
  const prompt = buildPrompt(transactions);

  const response = await trackInference(
    { provider: 'claude', model: 'claude-haiku-4-5-20251001', operation: 'rule-generation' },
    () =>
      withRateLimitRetry(
        () =>
          client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2000,
            messages: [{ role: 'user', content: prompt }],
          }),
        'generateRules',
        { logger, logPrefix: '[RuleGen]' }
      )
  );

  const text = response.content[0]?.type === 'text' ? response.content[0].text : null;
  if (!text) return [];

  const proposals = parseProposals(text);
  logger.info(
    { count: proposals.length, inputTokens: response.usage.input_tokens },
    '[RuleGen] Generated rules'
  );
  return proposals;
}
