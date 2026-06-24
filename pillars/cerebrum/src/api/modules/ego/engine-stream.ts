/**
 * Streaming generator for the ego conversation engine.
 *
 * Emits the scope notice (if any) as a leading token, then streams LLM token
 * deltas via the injected {@link EgoLlm} streaming port, then a final `done`
 * event carrying the citation-parsed content + token counts.
 */
import { CitationParser } from './citation-parser.js';

import type { RetrievalResult } from '../retrieval/types.js';
import type { EgoChatMessage, EgoLlm } from './llm.js';
import type { ChatStreamEvent } from './types.js';

interface StreamGeneratorParams {
  llm: EgoLlm;
  systemPrompt: string;
  llmMessages: EgoChatMessage[];
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
  const { llm, systemPrompt, llmMessages, scopeNotice, allResults } = params;
  const citationParser = new CitationParser();

  if (scopeNotice) {
    yield { type: 'token', text: `${scopeNotice}\n\n` };
  }

  for await (const event of llm.stream(systemPrompt, llmMessages)) {
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
