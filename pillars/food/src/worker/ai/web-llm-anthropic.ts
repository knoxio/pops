/**
 * Anthropic SDK wrapper scoped to the web-llm handler.
 *
 * The structural `AnthropicLike` subset lets handlers + tests pass
 * fakes without depending on the SDK's full `Anthropic` type, which is
 * a class and cannot be subtyped without the unsafe-cast dance.
 */
import Anthropic from '@anthropic-ai/sdk';

export interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

export interface AnthropicMessage {
  content: AnthropicTextBlock[] | { type: string; text?: string }[];
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

export interface AnthropicLike {
  messages: {
    create: (params: {
      model: string;
      max_tokens: number;
      messages: { role: 'user'; content: string }[];
    }) => Promise<AnthropicMessage>;
  };
}

let cachedClient: AnthropicLike | null = null;

export function getAnthropicClient(): AnthropicLike {
  if (cachedClient != null) return cachedClient;
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (apiKey == null || apiKey === '') {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  cachedClient = new Anthropic({ apiKey }) as unknown as AnthropicLike;
  return cachedClient;
}

/** Test seam: replace the cached SDK client with a fake. */
export function setAnthropicClientForTests(fake: AnthropicLike | null): void {
  cachedClient = fake;
}

export function extractTextFromMessage(message: AnthropicMessage): string {
  let text = '';
  for (const block of message.content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      text += block.text;
    }
  }
  return text;
}
