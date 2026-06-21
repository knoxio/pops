/**
 * LLM port for the cerebrum ego conversation engine.
 *
 * Ego needs three capabilities from the model: a one-shot chat completion, a
 * token-by-token streaming completion (SSE), and a one-shot summarisation of
 * older history. All three are modelled on the {@link EgoLlm} port so the
 * engine can be driven by a real Anthropic client in production and by canned
 * fakes in tests (tests MUST NOT reach a real API).
 *
 * Deviations from the monolith (parity with the ingest slice):
 * - **Model overrides / settings**: the monolith reads
 *   `getSettingValue('ego.*')`. The pillar has no settings service, so the
 *   model is a hardcoded constant with an optional `CEREBRUM_EGO_MODEL` env
 *   override and the chat/summary token+temperature knobs are constants.
 * - **Inference logging**: usage/cost/latency is reported to the ai pillar via
 *   `@pops/ai-telemetry` (`callWithLogging` for chat/summarise,
 *   `callWithLoggingStream` for the SSE stream — both fire-and-forget) plus the
 *   429 backoff ({@link withRateLimitRetry}) for correctness.
 */
import Anthropic from '@anthropic-ai/sdk';

import { callWithLogging, callWithLoggingStream } from '@pops/ai-telemetry';

import {
  ANTHROPIC_PROVIDER,
  CEREBRUM_DOMAIN,
  cerebrumTelemetryDeps,
} from '../ai-telemetry-deps.js';
import { withRateLimitRetry } from '../ingest/llm.js';
import { egoStreamEvents } from './stream-events.js';

import type { MessageStream } from '@anthropic-ai/sdk/lib/MessageStream';

export const DEFAULT_EGO_MODEL = 'claude-sonnet-4-6';

const CHAT_MAX_TOKENS = 2048;
const CHAT_TEMPERATURE = 0.3;
const SUMMARY_MAX_TOKENS = 512;
const SUMMARY_TEMPERATURE = 0;

const LLM_UNAVAILABLE_MSG =
  'I can help with that, but the LLM is currently unavailable. Please try again later.';
const LLM_ERROR_MSG = 'I encountered an error while generating a response. Please try again.';

export type EgoChatMessage = { role: 'user' | 'assistant'; content: string };

/** Response from a one-shot chat completion. */
export interface EgoLlmResponse {
  content: string;
  tokensIn: number;
  tokensOut: number;
}

/** A partial text token yielded during streaming. */
export interface EgoStreamChunk {
  type: 'token';
  text: string;
}

/** Final metadata yielded when the stream completes. */
export interface EgoStreamDone {
  type: 'done';
  fullText: string;
  tokensIn: number;
  tokensOut: number;
}

export type EgoStreamEvent = EgoStreamChunk | EgoStreamDone;

/**
 * Capability the ego engine depends on. The real implementation degrades to a
 * canned "unavailable" message (chat) / fallback events (stream) / placeholder
 * (summarise) when no API key is configured, so a missing key never throws.
 */
export interface EgoLlm {
  /** Resolve the configured chat model id (env override → default). */
  model(): string;
  chat(systemPrompt: string, messages: EgoChatMessage[]): Promise<EgoLlmResponse>;
  stream(systemPrompt: string, messages: EgoChatMessage[]): AsyncGenerator<EgoStreamEvent>;
  summarise(prompt: string, messageCount: number): Promise<string>;
}

function envModel(): string {
  const value = process.env['CEREBRUM_EGO_MODEL'];
  return value !== undefined && value !== '' ? value : DEFAULT_EGO_MODEL;
}

function* fallbackEvents(text: string): Generator<EgoStreamEvent> {
  yield { type: 'token', text };
  yield { type: 'done', fullText: text, tokensIn: 0, tokensOut: 0 };
}

/**
 * Real Anthropic-backed {@link EgoLlm}. Reads `ANTHROPIC_API_KEY` lazily on
 * each call so a missing key degrades gracefully rather than throwing at
 * construction. The model id comes from `CEREBRUM_EGO_MODEL` or the hardcoded
 * sonnet default.
 */
export class AnthropicEgoLlm implements EgoLlm {
  model(): string {
    return envModel();
  }

  async chat(systemPrompt: string, messages: EgoChatMessage[]): Promise<EgoLlmResponse> {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (apiKey === undefined || apiKey === '') {
      console.warn('[cerebrum-ego] ANTHROPIC_API_KEY not set — returning unavailable message');
      return { content: LLM_UNAVAILABLE_MSG, tokensIn: 0, tokensOut: 0 };
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const model = this.model();
    try {
      const response = await callWithLogging(
        {
          provider: ANTHROPIC_PROVIDER,
          model,
          operation: 'ego.chat',
          domain: CEREBRUM_DOMAIN,
          call: async () => {
            const created = await withRateLimitRetry(
              () =>
                client.messages.create({
                  model,
                  max_tokens: CHAT_MAX_TOKENS,
                  temperature: CHAT_TEMPERATURE,
                  system: systemPrompt,
                  messages,
                }),
              'ego.chat'
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
      return {
        content: first?.type === 'text' ? first.text : '',
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens,
      };
    } catch (err) {
      console.warn(
        `[cerebrum-ego] chat failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return { content: LLM_ERROR_MSG, tokensIn: 0, tokensOut: 0 };
    }
  }

  async *stream(systemPrompt: string, messages: EgoChatMessage[]): AsyncGenerator<EgoStreamEvent> {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (apiKey === undefined || apiKey === '') {
      console.warn('[cerebrum-ego] ANTHROPIC_API_KEY not set — returning unavailable message');
      yield* fallbackEvents(LLM_UNAVAILABLE_MSG);
      return;
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const model = this.model();
    let messageStream: MessageStream;
    try {
      messageStream = client.messages.stream({
        model,
        max_tokens: CHAT_MAX_TOKENS,
        temperature: CHAT_TEMPERATURE,
        system: systemPrompt,
        messages,
      });
    } catch (err) {
      console.warn(
        `[cerebrum-ego] stream creation failed: ${err instanceof Error ? err.message : String(err)}`
      );
      yield* fallbackEvents(LLM_ERROR_MSG);
      return;
    }

    yield* callWithLoggingStream(
      {
        provider: ANTHROPIC_PROVIDER,
        model,
        operation: 'ego.stream',
        domain: CEREBRUM_DOMAIN,
        stream: () => egoStreamEvents(messageStream),
        extractUsage: (last) =>
          last?.type === 'done'
            ? { inputTokens: last.tokensIn, outputTokens: last.tokensOut }
            : null,
      },
      cerebrumTelemetryDeps()
    );
  }

  async summarise(prompt: string, messageCount: number): Promise<string> {
    const fallback = `[Earlier conversation: ${messageCount} messages exchanged]`;
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (apiKey === undefined || apiKey === '') return fallback;

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const model = this.model();
    try {
      const response = await callWithLogging(
        {
          provider: ANTHROPIC_PROVIDER,
          model,
          operation: 'ego.summarise',
          domain: CEREBRUM_DOMAIN,
          call: async () => {
            const created = await withRateLimitRetry(
              () =>
                client.messages.create({
                  model,
                  max_tokens: SUMMARY_MAX_TOKENS,
                  temperature: SUMMARY_TEMPERATURE,
                  messages: [{ role: 'user', content: prompt }],
                }),
              'ego.summarise'
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
      return first?.type === 'text' ? first.text : fallback;
    } catch (err) {
      console.warn(
        `[cerebrum-ego] summarise failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return fallback;
    }
  }
}
