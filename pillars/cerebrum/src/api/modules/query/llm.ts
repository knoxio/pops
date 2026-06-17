/**
 * LLM ports for the cerebrum query engine.
 *
 * Two capabilities, both injectable so the engine runs against a real
 * Anthropic client in production and canned fakes in tests (tests MUST NOT
 * reach a real API):
 *
 *  - {@link QueryLlm}       — one-shot completion for `ask` (system + question →
 *                             text). Degrades to a display-safe fallback string
 *                             when the API key is missing or the call throws.
 *  - {@link QueryStreamLlm} — token-streaming completion for the SSE route,
 *                             yielding incremental text deltas then a final
 *                             token-usage record.
 *
 * Deviations from the monolith (parity with the ingest slice):
 * - Model overrides / settings → hardcoded `claude-sonnet-4-6` constant with an
 *   optional `CEREBRUM_QUERY_MODEL` env override. No settings-DB tier.
 * - `trackInference` / `ai_inference_log` dropped entirely. Only the 429
 *   backoff ({@link withRateLimitRetry}, reused from the ingest slice) is kept.
 */
import Anthropic from '@anthropic-ai/sdk';

import { withRateLimitRetry } from '../ingest/llm.js';

import type { MessageStream } from '@anthropic-ai/sdk/lib/MessageStream';

export const DEFAULT_QUERY_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 1024;

const LLM_UNAVAILABLE_MSG =
  "I don't have enough information to answer that fully. (LLM unavailable)";
const LLM_ERROR_MSG = "I don't have enough information to answer that fully. (LLM error)";

function queryModel(): string {
  const value = process.env['CEREBRUM_QUERY_MODEL'];
  return value !== undefined && value !== '' ? value : DEFAULT_QUERY_MODEL;
}

/** One-shot query completion. */
export interface QueryLlm {
  /**
   * Return the model's answer for a system prompt + question. Always resolves
   * to a display-safe string — never throws — degrading to a fallback message
   * when the model is unavailable.
   */
  complete(systemPrompt: string, question: string): Promise<string>;
}

/** A single text delta yielded while the model streams. */
export interface QueryStreamDelta {
  kind: 'delta';
  text: string;
}

/** Terminal record yielded once the model stream completes. */
export interface QueryStreamFinal {
  kind: 'final';
  tokensIn: number;
  tokensOut: number;
}

export type QueryStreamChunk = QueryStreamDelta | QueryStreamFinal;

/** Token-streaming query completion. */
export interface QueryStreamLlm {
  /**
   * Stream the model's answer as text deltas, terminated by a single `final`
   * chunk carrying token usage. Never throws — a missing key / SDK error
   * yields a fallback delta then a zero-usage `final`.
   */
  stream(systemPrompt: string, question: string): AsyncGenerator<QueryStreamChunk>;
}

/**
 * Real Anthropic-backed {@link QueryLlm}. Reads `ANTHROPIC_API_KEY` lazily so a
 * missing key degrades to a fallback message rather than throwing.
 */
export class AnthropicQueryLlm implements QueryLlm {
  async complete(systemPrompt: string, question: string): Promise<string> {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (apiKey === undefined || apiKey === '') {
      console.warn('[cerebrum-query] ANTHROPIC_API_KEY not set — returning fallback answer');
      return LLM_UNAVAILABLE_MSG;
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    try {
      const response = await withRateLimitRetry(
        () =>
          client.messages.create({
            model: queryModel(),
            max_tokens: DEFAULT_MAX_TOKENS,
            temperature: 0,
            system: systemPrompt,
            messages: [{ role: 'user', content: question }],
          }),
        'cerebrum.query'
      );
      const first = response.content[0];
      return first?.type === 'text' ? first.text : '';
    } catch (err) {
      console.warn(
        `[cerebrum-query] LLM call failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return LLM_ERROR_MSG;
    }
  }
}

async function* iterateStream(stream: MessageStream): AsyncGenerator<QueryStreamChunk> {
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield { kind: 'delta', text: event.delta.text };
    }
  }
  const finalMessage = await stream.finalMessage();
  yield {
    kind: 'final',
    tokensIn: finalMessage.usage.input_tokens,
    tokensOut: finalMessage.usage.output_tokens,
  };
}

/**
 * Real Anthropic-backed {@link QueryStreamLlm}. Mirrors {@link AnthropicQueryLlm}'s
 * degradation: a missing key yields the unavailable fallback, an SDK error
 * yields the error fallback, both terminated by a zero-usage `final`.
 */
export class AnthropicQueryStreamLlm implements QueryStreamLlm {
  async *stream(systemPrompt: string, question: string): AsyncGenerator<QueryStreamChunk> {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (apiKey === undefined || apiKey === '') {
      console.warn('[cerebrum-query] ANTHROPIC_API_KEY not set — yielding fallback answer');
      yield { kind: 'delta', text: LLM_UNAVAILABLE_MSG };
      yield { kind: 'final', tokensIn: 0, tokensOut: 0 };
      return;
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    let stream: MessageStream;
    try {
      stream = client.messages.stream({
        model: queryModel(),
        max_tokens: DEFAULT_MAX_TOKENS,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: 'user', content: question }],
      });
    } catch (err) {
      console.warn(
        `[cerebrum-query] stream creation failed: ${err instanceof Error ? err.message : String(err)}`
      );
      yield { kind: 'delta', text: LLM_ERROR_MSG };
      yield { kind: 'final', tokensIn: 0, tokensOut: 0 };
      return;
    }

    try {
      yield* iterateStream(stream);
    } catch (err) {
      console.warn(
        `[cerebrum-query] stream processing failed: ${err instanceof Error ? err.message : String(err)}`
      );
      yield { kind: 'final', tokensIn: 0, tokensOut: 0 };
    }
  }
}
