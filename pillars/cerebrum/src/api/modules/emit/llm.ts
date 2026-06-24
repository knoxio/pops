/**
 * LLM port for the cerebrum document-generation engine.
 * Spec: pillars/cerebrum/docs/prds/document-generation.
 *
 * The generation pipeline needs one capability: send a system prompt + user
 * message and get the synthesised document text back. Modelled as the
 * {@link GenerationLlm} port so it runs against a real Anthropic client in
 * production and a canned fake in tests (tests MUST NOT reach a real API).
 *
 * Model is `DEFAULT_EMIT_MODEL` unless `CEREBRUM_EMIT_MODEL` overrides it;
 * max-tokens is a constant. Usage/cost is reported to the ai pillar via
 * `@pops/ai-telemetry` (`callWithLogging`, fire-and-forget); the 429 backoff
 * is {@link withRateLimitRetry}. A missing API key returns a placeholder
 * string rather than throwing; a transport error throws so the handler
 * surfaces a 500.
 */
import Anthropic from '@anthropic-ai/sdk';

import { callWithLogging } from '@pops/ai-telemetry';

import {
  ANTHROPIC_PROVIDER,
  CEREBRUM_DOMAIN,
  cerebrumTelemetryDeps,
} from '../ai-telemetry-deps.js';
import { withRateLimitRetry } from '../ingest/llm.js';

export const DEFAULT_EMIT_MODEL = 'claude-sonnet-4-6';
const EMIT_OPERATION = 'emit.generate';
const DEFAULT_MAX_TOKENS = 2048;
const UNAVAILABLE_MSG = '(Document generation unavailable — LLM API key not configured)';

function emitModel(): string {
  const value = process.env['CEREBRUM_EMIT_MODEL'];
  return value !== undefined && value !== '' ? value : DEFAULT_EMIT_MODEL;
}

/** Capability the generation modes depend on. */
export interface GenerationLlm {
  /**
   * Synthesise a document from a system prompt + user message. Returns a
   * placeholder string when the model is unavailable (no API key); throws on
   * a transport error so the caller surfaces a 500.
   */
  generate(systemPrompt: string, userMessage: string): Promise<string>;
}

/**
 * Real Anthropic-backed {@link GenerationLlm}. Reads `ANTHROPIC_API_KEY` lazily
 * so a missing key degrades to the unavailable placeholder rather than
 * throwing at construction.
 */
export class AnthropicGenerationLlm implements GenerationLlm {
  async generate(systemPrompt: string, userMessage: string): Promise<string> {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (apiKey === undefined || apiKey === '') {
      console.warn('[cerebrum-emit] ANTHROPIC_API_KEY not set — cannot generate document');
      return UNAVAILABLE_MSG;
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const model = emitModel();
    try {
      const response = await callWithLogging(
        {
          provider: ANTHROPIC_PROVIDER,
          model,
          operation: EMIT_OPERATION,
          domain: CEREBRUM_DOMAIN,
          call: async () => {
            const created = await withRateLimitRetry(
              () =>
                client.messages.create({
                  model,
                  max_tokens: DEFAULT_MAX_TOKENS,
                  temperature: 0,
                  system: systemPrompt,
                  messages: [{ role: 'user', content: userMessage }],
                }),
              'cerebrum.emit'
            );
            return {
              response: created,
              usage: {
                inputTokens: created.usage.input_tokens,
                outputTokens: created.usage.output_tokens,
              },
            };
          },
        },
        cerebrumTelemetryDeps()
      );
      const first = response.content[0];
      return first?.type === 'text' ? first.text : '';
    } catch (err) {
      throw new Error(
        `Document generation failed: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    }
  }
}
