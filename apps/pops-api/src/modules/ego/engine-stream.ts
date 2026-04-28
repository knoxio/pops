/**
 * Streaming generator for the Ego conversation engine (PRD-087 US-01 AC #6).
 *
 * Extracted from engine.ts to keep file sizes within the max-lines rule
 * and avoid `no-this-alias` issues with inner generator functions.
 */
import { CitationParser } from '../cerebrum/query/citation-parser.js';
import { streamChatLlm } from './llm-client.js';

import type { RetrievalResult } from '../cerebrum/retrieval/types.js';
import type { ChatStreamEvent } from './types.js';

interface StreamGeneratorParams {
  model: string;
  systemPrompt: string;
  llmMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  scopeNotice: string | null;
  allResults: RetrievalResult[];
}

/**
 * Create an async generator that streams LLM tokens and emits a final
 * done event with parsed citations and token counts.
 */
export async function* generateStreamEvents(
  params: StreamGeneratorParams
): AsyncGenerator<ChatStreamEvent> {
  const { model, systemPrompt, llmMessages, scopeNotice, allResults } = params;
  const citationParser = new CitationParser();

  if (scopeNotice) {
    yield { type: 'token', text: `${scopeNotice}\n\n` };
  }

  const llmStream = streamChatLlm(model, systemPrompt, llmMessages);

  for await (const event of llmStream) {
    if (event.type === 'token') {
      yield { type: 'token', text: event.text };
    } else {
      const { cleanedAnswer, citations } = citationParser.parse(event.fullText, allResults);
      const responseContent = scopeNotice ? `${scopeNotice}\n\n${cleanedAnswer}` : cleanedAnswer;

      yield {
        type: 'done',
        content: responseContent,
        citations: citations.map((c) => c.id),
        tokensIn: event.tokensIn,
        tokensOut: event.tokensOut,
      };
    }
  }
}
