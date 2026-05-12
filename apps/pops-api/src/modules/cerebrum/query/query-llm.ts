/**
 * Non-streaming LLM client for the Cerebrum Query Engine (PRD-082).
 *
 * Encapsulates the rate-limit retry + inference tracking around the
 * Anthropic `messages.create` call so `query-service.ts` stays under the
 * `max-lines` budget. The streaming variant lives in `query-stream.ts`.
 */
import Anthropic from '@anthropic-ai/sdk';

import { getEnv } from '../../../env.js';
import { withRateLimitRetry } from '../../../lib/ai-retry.js';
import { trackInference } from '../../../lib/inference-middleware.js';
import { logger } from '../../../lib/logger.js';
import { getAiModel } from '../../core/settings/service.js';

const OPERATION = 'cerebrum.query';

const LLM_UNAVAILABLE_MSG =
  "I don't have enough information to answer that fully. (LLM unavailable)";
const LLM_ERROR_MSG = "I don't have enough information to answer that fully. (LLM error)";

function getQueryModel(): string {
  return getAiModel('ai.modelOverrides.query', 'claude-sonnet-4-6');
}

/**
 * Call Claude for query answer generation. Gracefully degrades when the
 * API key is missing or the call throws — callers always receive a string
 * suitable for display.
 */
export async function callQueryLlm(systemPrompt: string, question: string): Promise<string> {
  const apiKey = getEnv('ANTHROPIC_API_KEY');
  if (!apiKey) {
    logger.warn('[QueryEngine] ANTHROPIC_API_KEY not set — returning retrieval-only answer');
    return LLM_UNAVAILABLE_MSG;
  }

  const client = new Anthropic({ apiKey, maxRetries: 0 });
  const model = getQueryModel();

  try {
    const response = await trackInference(
      { provider: 'claude', model, operation: OPERATION, domain: 'cerebrum' },
      () =>
        withRateLimitRetry(
          () =>
            client.messages.create({
              model,
              max_tokens: 1024,
              temperature: 0,
              system: systemPrompt,
              messages: [{ role: 'user', content: question }],
            }),
          OPERATION,
          { logger, logPrefix: '[QueryEngine]' }
        )
    );

    return response.content[0]?.type === 'text' ? response.content[0].text : '';
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      '[QueryEngine] LLM call failed'
    );
    return LLM_ERROR_MSG;
  }
}
