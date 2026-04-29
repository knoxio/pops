/**
 * LLM-based contradiction detector (PRD-085 #2243).
 *
 * Compares two engram bodies via the Claude API and returns a conflict
 * summary if contradictions are found. Returns null if statements are
 * consistent.
 */
import Anthropic from '@anthropic-ai/sdk';

import { getEnv } from '../../../env.js';
import { withRateLimitRetry } from '../../../lib/ai-retry.js';
import { trackInference } from '../../../lib/inference-middleware.js';
import { logger } from '../../../lib/logger.js';
import { getSettingValue } from '../../core/settings/service.js';

import type { ContradictionDetector } from './auditor.js';

const OPERATION = 'cerebrum.auditor.contradiction';

function getModel(): string {
  return getSettingValue('cerebrum.auditor.contradictionModel', 'claude-haiku-4-20250514');
}

const SYSTEM_PROMPT = `You are an impartial fact-checker. You will receive two text passages that belong to the same knowledge domain. Your task:

1. Identify any factual contradictions between the two passages.
2. A contradiction is when one passage asserts something that directly conflicts with what the other passage asserts about the same subject.
3. Differences in scope, perspective, or complementary information are NOT contradictions.
4. If you find a contradiction, respond with a single concise sentence describing the conflict.
5. If there is no contradiction, respond with exactly: NO_CONTRADICTION

Do not explain your reasoning. Only output the conflict summary or NO_CONTRADICTION.`;

/** LLM-based contradiction detector using Claude API. */
export class LlmContradictionDetector implements ContradictionDetector {
  async detectContradiction(bodyA: string, bodyB: string): Promise<string | null> {
    const apiKey = getEnv('ANTHROPIC_API_KEY');
    if (!apiKey) {
      logger.warn('[ContradictionDetector] ANTHROPIC_API_KEY not set — skipping');
      return null;
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const model = getModel();
    const userMessage = `Passage A:\n${truncate(bodyA)}\n\nPassage B:\n${truncate(bodyB)}`;

    const response = await trackInference(
      { provider: 'claude', model, operation: OPERATION, domain: 'cerebrum' },
      () =>
        withRateLimitRetry(
          () =>
            client.messages.create({
              model,
              max_tokens: 200,
              temperature: 0,
              system: SYSTEM_PROMPT,
              messages: [{ role: 'user', content: userMessage }],
            }),
          OPERATION,
          { logger, logPrefix: '[ContradictionDetector]' }
        )
    );

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';

    if (text === 'NO_CONTRADICTION' || text === '') {
      return null;
    }

    return text;
  }
}

/** Truncate body to 2000 chars to stay within token budget. */
function truncate(body: string, maxLen = 2000): string {
  if (body.length <= maxLen) return body;
  return body.slice(0, maxLen) + '...';
}
