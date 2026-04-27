/**
 * LLM client for the Ego conversation engine (PRD-087 US-01).
 *
 * Handles all Anthropic API calls: chat generation and history summarisation.
 * Encapsulates rate limiting, inference tracking, and error handling.
 */
import Anthropic from '@anthropic-ai/sdk';

import { getEnv } from '../../env.js';
import { withRateLimitRetry } from '../../lib/ai-retry.js';
import { trackInference } from '../../lib/inference-middleware.js';
import { logger } from '../../lib/logger.js';

const LLM_UNAVAILABLE_MSG =
  'I can help with that, but the LLM is currently unavailable. Please try again later.';
const LLM_ERROR_MSG = 'I encountered an error while generating a response. Please try again.';

/** Response from the LLM including text and token counts. */
export interface LlmResponse {
  content: string;
  tokensIn: number;
  tokensOut: number;
}

/** Call the LLM for chat generation. */
export async function callChatLlm(
  model: string,
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<LlmResponse> {
  const apiKey = getEnv('ANTHROPIC_API_KEY');
  if (!apiKey) {
    logger.warn('[Ego] ANTHROPIC_API_KEY not set — returning unavailable message');
    return { content: LLM_UNAVAILABLE_MSG, tokensIn: 0, tokensOut: 0 };
  }

  const client = new Anthropic({ apiKey, maxRetries: 0 });

  try {
    const response = await trackInference(
      { provider: 'claude', model, operation: 'ego.chat', domain: 'ego' },
      () =>
        withRateLimitRetry(
          () =>
            client.messages.create({
              model,
              max_tokens: 2048,
              temperature: 0.3,
              system: systemPrompt,
              messages,
            }),
          'ego.chat',
          { logger, logPrefix: '[Ego]' }
        )
    );

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    return {
      content: text,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
    };
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      '[Ego] LLM call failed'
    );
    return { content: LLM_ERROR_MSG, tokensIn: 0, tokensOut: 0 };
  }
}

/** Call the LLM to summarise older conversation history. */
export async function callSummariseLlm(
  model: string,
  prompt: string,
  messageCount: number
): Promise<string> {
  const apiKey = getEnv('ANTHROPIC_API_KEY');
  const fallback = `[Earlier conversation: ${messageCount} messages exchanged]`;

  if (!apiKey) {
    return fallback;
  }

  const client = new Anthropic({ apiKey, maxRetries: 0 });

  try {
    const response = await trackInference(
      { provider: 'claude', model, operation: 'ego.summarise', domain: 'ego' },
      () =>
        withRateLimitRetry(
          () =>
            client.messages.create({
              model,
              max_tokens: 512,
              temperature: 0,
              messages: [{ role: 'user', content: prompt }],
            }),
          'ego.summarise',
          { logger, logPrefix: '[Ego]' }
        )
    );

    return response.content[0]?.type === 'text' ? response.content[0].text : fallback;
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      '[Ego] History summarisation failed — using placeholder'
    );
    return fallback;
  }
}
