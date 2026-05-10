import { withRateLimitRetry } from '../../../../lib/ai-retry.js';
import { trackInference } from '../../../../lib/inference-middleware.js';
import { logger } from '../../../../lib/logger.js';
import { AiCategorizationError } from './ai-categorizer-error.js';

/**
 * AI categorizer API helpers — prompt building, API call, and error handling.
 */
import type Anthropic from '@anthropic-ai/sdk';

import type { AiCacheEntry } from '../../../core/ai-usage/cache.js';

export interface ApiCallResponse {
  text: string | null;
  inputTokens: number;
  outputTokens: number;
}

export interface ApiCallOptions {
  client: Anthropic;
  rawRow: string;
  sanitizedDescription: string;
  importBatchId: string | undefined;
  model: string;
  maxTokens: number;
}

export function buildPrompt(rawRow: string): string {
  return `Given this bank transaction data, identify the merchant/entity name and a spending category.

Transaction data: ${rawRow}

Reply in JSON only: {"entityName": "...", "category": "..."}

entityName rules:
- Return the brand or chain name only (e.g. "Woolworths", "Metro Petroleum", "Transport for NSW").
- Do NOT include store numbers, location codes, or postcode segments — strip them.
- Do NOT include trailing suburb / city names that are duplicated in the source row's location field.
- If you cannot identify a real merchant from the description, return entityName as null.
  Do NOT invent placeholder names like "Unknown Membership Organization", "Generic Merchant", "Unidentified Vendor", or similar — null is the correct answer when the merchant is unrecoverable.

Common categories: Groceries, Dining, Transport, Utilities, Entertainment, Shopping, Health, Insurance, Subscriptions, Income, Transfer, Government, Education, Travel, Rent, Other.`;
}

/**
 * Patterns the LLM uses to invent placeholder entity names when it cannot
 * recover a real merchant from the description (#2449). Surfacing these as
 * suggested entities pollutes the entities table — treat as null instead so
 * the row falls into the manual-pick bucket.
 *
 * Word-boundary `\b` ensures real names like "Generic Pharma Co" or "Unknown
 * Pleasures Records" — should they ever be merchant names — are not blocked,
 * since they wouldn't match the leading-word-only pattern. Only entries
 * starting with the placeholder word are stripped.
 */
const PLACEHOLDER_LEADING_WORDS = [
  'unknown',
  'unidentified',
  'unspecified',
  'unnamed',
  'generic',
  'placeholder',
  'unrecognized',
  'unrecognised',
];

const PLACEHOLDER_REGEX = new RegExp(`^(${PLACEHOLDER_LEADING_WORDS.join('|')})\\b`, 'i');

/**
 * Strip trailing tokens that look like store numbers or location codes — the
 * model occasionally leaks these into entityName despite the prompt
 * instruction (#2450). Specifically removes any trailing run that begins with
 * a 3+ digit token, since real merchant names rarely end with raw numbers.
 *
 * Examples (input → output):
 *   "Metro Petroleum 7342896 Hurlstone Par" → "Metro Petroleum"
 *   "WW Metro 1130 Park"                    → "WW Metro"
 *   "7-Eleven"                              → "7-Eleven"  (digit not a trailing token)
 */
function stripTrailingStoreCodes(name: string): string {
  return name.replace(/\s+\d{3,}\b.*$/, '').trim();
}

/**
 * Sanitize an LLM-suggested entityName: drop placeholders to null, strip
 * leaked store numbers / location codes. Returns null when the cleaned
 * result would not be a usable merchant name.
 */
export function sanitizeEntityName(name: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  if (PLACEHOLDER_REGEX.test(trimmed)) return null;
  const stripped = stripTrailingStoreCodes(trimmed);
  if (stripped.length === 0) return null;
  if (PLACEHOLDER_REGEX.test(stripped)) return null;
  return stripped;
}

export async function callApi(opts: ApiCallOptions): Promise<ApiCallResponse> {
  const { client, rawRow, sanitizedDescription, importBatchId, model, maxTokens } = opts;
  const response = await trackInference(
    {
      provider: 'claude',
      model,
      operation: 'entity-match',
      domain: 'finance',
      contextId: importBatchId,
    },
    () =>
      withRateLimitRetry(
        () =>
          client.messages.create({
            model,
            max_tokens: maxTokens,
            messages: [{ role: 'user', content: buildPrompt(rawRow) }],
          }),
        sanitizedDescription,
        { logger, logPrefix: '[AI]' }
      )
  );
  const text = response.content[0]?.type === 'text' ? response.content[0].text : null;
  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

export function buildEntryFromText(text: string, rawRow: string): AiCacheEntry {
  const cleanedText = text
    .trim()
    .replaceAll(/^```(?:json)?\s*\n?/gm, '')
    .replaceAll(/\n?```\s*$/gm, '');
  const parsed = JSON.parse(cleanedText) as {
    entityName: string | null;
    category: string;
  };
  return {
    description: rawRow.trim(),
    entityName: sanitizeEntityName(parsed.entityName),
    category: parsed.category,
    cachedAt: new Date().toISOString(),
  };
}

export function throwApiError(error: unknown): never {
  if (error && typeof error === 'object' && 'status' in error) {
    const apiError = error as {
      status: number;
      message?: string;
      error?: { error?: { message?: string } };
    };
    if (apiError.status === 400) {
      const msg =
        apiError.error?.error?.message ??
        (apiError as { message?: string }).message ??
        'Unknown API error';
      if (msg.toLowerCase().includes('credit balance')) {
        throw new AiCategorizationError(
          'Anthropic API credit balance too low. Please add credits at https://console.anthropic.com/settings/plans',
          'INSUFFICIENT_CREDITS'
        );
      }
    }
    throw new AiCategorizationError(
      `Anthropic API error: ${apiError.message ?? 'Unknown error'}`,
      'API_ERROR'
    );
  }
  throw new AiCategorizationError(
    `Failed to categorize: ${error instanceof Error ? error.message : 'Unknown error'}`,
    'API_ERROR'
  );
}

export async function callApiOrThrow(opts: ApiCallOptions): Promise<ApiCallResponse> {
  try {
    return await callApi(opts);
  } catch (error) {
    logger.error(
      {
        description: opts.sanitizedDescription,
        error: error instanceof Error ? error.message : String(error),
      },
      '[AI] API call failed'
    );
    throwApiError(error);
  }
}
