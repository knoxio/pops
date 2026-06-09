/**
 * PRD-130 — lazy Anthropic SDK client + the narrow structural subset
 * worker handlers consume.
 *
 * The SDK's `Anthropic` class carries dozens of overloads on
 * `messages.create`. Worker handlers only need a tiny structural slice
 * (one call, JSON response), so the seam exposes `AnthropicLike`. Tests
 * pass a plain object satisfying that interface — the runtime cache is
 * populated lazily from the real SDK in production, or directly via
 * `setAnthropicClient` in tests.
 */
import type Anthropic from '@anthropic-ai/sdk';

export interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
}

export interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

export interface AnthropicMessage {
  id?: string;
  model?: string;
  content: AnthropicTextBlock[];
  usage?: AnthropicUsage;
}

export type AnthropicCreateParams = Parameters<Anthropic['messages']['create']>[0];

export interface AnthropicLike {
  messages: {
    create: (params: AnthropicCreateParams) => Promise<AnthropicMessage>;
  };
}

let cachedClient: AnthropicLike | null = null;

export function setAnthropicClient(client: AnthropicLike | null): void {
  cachedClient = client;
}

export async function getAnthropicClient(apiKey: string): Promise<AnthropicLike> {
  if (cachedClient !== null) return cachedClient;
  const sdkModule = await import('@anthropic-ai/sdk');
  const sdkInstance = new sdkModule.default({ apiKey });
  cachedClient = adaptSdk(sdkInstance);
  return cachedClient;
}

function adaptSdk(sdkInstance: Anthropic): AnthropicLike {
  return {
    messages: {
      create: async (params) => {
        const response = await sdkInstance.messages.create(params);
        return normaliseMessage(response);
      },
    },
  };
}

function normaliseMessage(response: unknown): AnthropicMessage {
  if (typeof response !== 'object' || response === null) {
    throw new Error('Anthropic response was not an object');
  }
  const obj = response as Record<string, unknown>;
  return {
    id: typeof obj['id'] === 'string' ? obj['id'] : undefined,
    model: typeof obj['model'] === 'string' ? obj['model'] : undefined,
    content: normaliseContent(obj['content']),
    usage: normaliseUsage(obj['usage']),
  };
}

function normaliseContent(rawContent: unknown): AnthropicTextBlock[] {
  if (!Array.isArray(rawContent)) return [];
  const content: AnthropicTextBlock[] = [];
  for (const block of rawContent) {
    if (typeof block !== 'object' || block === null) continue;
    const obj = block as { type?: unknown; text?: unknown };
    if (obj.type === 'text' && typeof obj.text === 'string') {
      content.push({ type: 'text', text: obj.text });
    }
  }
  return content;
}

function normaliseUsage(rawUsage: unknown): AnthropicUsage | undefined {
  if (typeof rawUsage !== 'object' || rawUsage === null) return undefined;
  return rawUsage as AnthropicUsage;
}
