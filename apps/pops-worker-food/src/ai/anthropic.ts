import Anthropic from '@anthropic-ai/sdk';

import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';

/**
 * Thin wrapper around the Anthropic SDK so handlers don't reach for the
 * raw `Anthropic` import (keeps test mocks centralised on this module).
 *
 * `maxRetries: 0` matches the convention in `apps/pops-api` — retries
 * belong in the BullMQ job lifecycle, not the SDK, so a transient 429
 * surfaces here, the job throws, and BullMQ schedules the next attempt.
 *
 * The response shape declared here is a structural subset of the SDK's
 * `Message` — handlers only read `content[].text` and `usage.input_tokens` /
 * `usage.output_tokens`. Narrowing the type lets tests construct fixtures
 * without dragging in every field of the real `Message` (and without the
 * `as unknown as Message` cast that would imply).
 */
export interface AnthropicContentBlock {
  type: string;
  text?: string;
}

export interface AnthropicMessageUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
}

export interface AnthropicMessage {
  content: AnthropicContentBlock[];
  usage?: AnthropicMessageUsage | null;
}

export interface AnthropicLike {
  messages: {
    create(params: MessageCreateParamsNonStreaming): Promise<AnthropicMessage>;
  };
}

export function createAnthropicClient(apiKey: string): AnthropicLike {
  return new Anthropic({ apiKey, maxRetries: 0 });
}
