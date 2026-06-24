/**
 * Streaming generator for the cerebrum query engine.
 *
 * Companion to `query-service.ts`: drives the injected {@link QueryStreamLlm}
 * port, yielding incremental `token` events while the model streams and a
 * final `done` event with parsed citations + confidence. The Anthropic call
 * lives behind the port so tests inject a fake that yields canned tokens.
 */
import { CitationParser } from './citation-parser.js';

import type { RetrievalResult } from '../retrieval/types.js';
import type { QueryStreamLlm } from './llm.js';
import type { ConfidenceLevel, SourceCitation } from './types.js';

/** Event yielded while tokens are still streaming. */
export interface QueryStreamToken {
  type: 'token';
  text: string;
}

/** Final event emitted after the LLM stream completes. */
export interface QueryStreamDone {
  type: 'done';
  /** Cleaned answer text (citations stripped of hallucinations). */
  answer: string;
  sources: SourceCitation[];
  scopes: string[];
  confidence: ConfidenceLevel;
  tokensIn: number;
  tokensOut: number;
}

/** Union type for all events yielded by `streamQueryAnswer`. */
export type QueryStreamEvent = QueryStreamToken | QueryStreamDone;

function computeConfidence(sources: SourceCitation[]): ConfidenceLevel {
  if (sources.length === 0) return 'low';
  const topScore = sources[0]?.relevance ?? 0;
  if (topScore > 0.8) return 'high';
  if (topScore >= 0.5) return 'medium';
  return 'low';
}

export interface StreamQueryAnswerParams {
  llm: QueryStreamLlm;
  systemPrompt: string;
  question: string;
  retrievedResults: RetrievalResult[];
  scopes: string[];
}

/**
 * Stream a query answer token-by-token, then emit a single `done` event with
 * the parsed citation set, computed confidence and the final scopes used.
 * The injected {@link QueryStreamLlm} handles its own degradation, so this
 * generator stays purely about wiring tokens through and parsing the result.
 */
export async function* streamQueryAnswer(
  params: StreamQueryAnswerParams
): AsyncGenerator<QueryStreamEvent> {
  const { llm, systemPrompt, question, retrievedResults, scopes } = params;
  const citationParser = new CitationParser();

  let fullText = '';
  let tokensIn = 0;
  let tokensOut = 0;

  for await (const chunk of llm.stream(systemPrompt, question)) {
    if (chunk.kind === 'delta') {
      fullText += chunk.text;
      yield { type: 'token', text: chunk.text };
    } else {
      tokensIn = chunk.tokensIn;
      tokensOut = chunk.tokensOut;
    }
  }

  const { cleanedAnswer, citations } = citationParser.parse(fullText, retrievedResults);
  const confidence: ConfidenceLevel = citations.length === 0 ? 'low' : computeConfidence(citations);

  yield {
    type: 'done',
    answer: cleanedAnswer,
    sources: citations,
    scopes,
    confidence,
    tokensIn,
    tokensOut,
  };
}
