/**
 * LLM call helper for document generation (PRD-083).
 *
 * Extracted to keep GenerationService under the line limit and
 * to centralise LLM interaction patterns for the emit module.
 */
import Anthropic from '@anthropic-ai/sdk';

import { getEnv } from '../../../env.js';
import { withRateLimitRetry } from '../../../lib/ai-retry.js';
import { trackInference } from '../../../lib/inference-middleware.js';
import { logger } from '../../../lib/logger.js';
import { getSettingValue } from '../../core/settings/service.js';

const OPERATION = 'cerebrum.emit';

function getEmitModel(): string {
  return getSettingValue('cerebrum.emit.model', 'claude-sonnet-4-20250514');
}

function getEmitMaxTokens(): number {
  return getSettingValue('cerebrum.emit.maxTokens', 2048);
}

/** Call the LLM for document generation. Gracefully degrades if API key is missing. */
export async function callEmitLlm(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = getEnv('ANTHROPIC_API_KEY');
  if (!apiKey) {
    logger.warn('[EmitService] ANTHROPIC_API_KEY not set — cannot generate document');
    return '(Document generation unavailable — LLM API key not configured)';
  }

  const client = new Anthropic({ apiKey, maxRetries: 0 });
  const model = getEmitModel();
  const maxTokens = getEmitMaxTokens();

  try {
    const response = await trackInference(
      { provider: 'claude', model, operation: OPERATION, domain: 'cerebrum' },
      () =>
        withRateLimitRetry(
          () =>
            client.messages.create({
              model,
              max_tokens: maxTokens,
              temperature: 0,
              system: systemPrompt,
              messages: [{ role: 'user', content: userMessage }],
            }),
          OPERATION,
          { logger, logPrefix: '[EmitService]' }
        )
    );

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    return text;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      '[EmitService] LLM call failed'
    );
    throw new Error(
      `Document generation failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err }
    );
  }
}
