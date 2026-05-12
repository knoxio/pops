/**
 * Streaming generator for the Cerebrum Query Engine (PRD-082, issue #2596).
 *
 * Companion to `query-service.ts`: assembles the same retrieval/context
 * pipeline but yields incremental `token` chunks while the LLM is streaming
 * and a final `done` event with parsed citations + confidence.
 *
 * Mirrors the event shape of the Ego streaming generator
 * (`modules/cerebrum/ego/engine-stream.ts`) so the SSE route handler in
 * `routes/cerebrum/query-stream.ts` can use the same SSE wire format.
 */
import Anthropic from '@anthropic-ai/sdk';

import { getEnv } from '../../../env.js';
import { trackInference } from '../../../lib/inference-middleware.js';
import { logger } from '../../../lib/logger.js';
import { getAiModel, getSettingValue } from '../../core/settings/service.js';
import { CitationParser } from './citation-parser.js';

import type { MessageStream } from '@anthropic-ai/sdk/lib/MessageStream';

import type { RetrievalResult } from '../retrieval/types.js';
import type { ConfidenceLevel, SourceCitation } from './types.js';

const OPERATION = 'cerebrum.query.stream';

const LLM_UNAVAILABLE_MSG =
  "I don't have enough information to answer that fully. (LLM unavailable)";
const LLM_ERROR_MSG = "I don't have enough information to answer that fully. (LLM error)";

function getQueryModel(): string {
  return getAiModel('ai.modelOverrides.query', 'claude-sonnet-4-6');
}

function getQueryStreamMaxTokens(): number {
  return getSettingValue('cerebrum.query.maxTokens', 1024);
}

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

/** Track streaming inference after the stream completes. */
function trackStreamInference(model: string, tokensIn: number, tokensOut: number): void {
  trackInference({ provider: 'claude', model, operation: OPERATION, domain: 'cerebrum' }, () =>
    Promise.resolve({ usage: { input_tokens: tokensIn, output_tokens: tokensOut } })
  ).catch((err) => {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      '[QueryEngine] Failed to track streaming inference'
    );
  });
}

interface RawLlmStreamParams {
  client: Anthropic;
  model: string;
  systemPrompt: string;
  question: string;
}

/** Yield text deltas from the Anthropic stream + a final usage record. */
async function* iterateLlmStream(
  params: RawLlmStreamParams
): AsyncGenerator<
  { kind: 'delta'; text: string } | { kind: 'final'; tokensIn: number; tokensOut: number }
> {
  let stream: MessageStream;
  try {
    stream = params.client.messages.stream({
      model: params.model,
      max_tokens: getQueryStreamMaxTokens(),
      temperature: 0,
      system: params.systemPrompt,
      messages: [{ role: 'user', content: params.question }],
    });
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      '[QueryEngine] Stream creation failed'
    );
    yield { kind: 'delta', text: LLM_ERROR_MSG };
    yield { kind: 'final', tokensIn: 0, tokensOut: 0 };
    return;
  }

  try {
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
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      '[QueryEngine] Stream processing failed'
    );
    yield { kind: 'final', tokensIn: 0, tokensOut: 0 };
  }
}

interface StreamQueryAnswerParams {
  systemPrompt: string;
  question: string;
  retrievedResults: RetrievalResult[];
  scopes: string[];
}

/**
 * Stream a query answer token-by-token, then emit a single `done` event with
 * the parsed citation set, computed confidence and the final scopes used.
 *
 * Gracefully degrades when ANTHROPIC_API_KEY is missing or the SDK call
 * fails: yields a fallback message then a `done` event with low confidence.
 */
export async function* streamQueryAnswer(
  params: StreamQueryAnswerParams
): AsyncGenerator<QueryStreamEvent> {
  const { systemPrompt, question, retrievedResults, scopes } = params;
  const apiKey = getEnv('ANTHROPIC_API_KEY');
  const citationParser = new CitationParser();

  if (!apiKey) {
    logger.warn('[QueryEngine] ANTHROPIC_API_KEY not set — yielding fallback answer');
    yield { type: 'token', text: LLM_UNAVAILABLE_MSG };
    yield {
      type: 'done',
      answer: LLM_UNAVAILABLE_MSG,
      sources: [],
      scopes,
      confidence: 'low',
      tokensIn: 0,
      tokensOut: 0,
    };
    return;
  }

  const client = new Anthropic({ apiKey, maxRetries: 0 });
  const model = getQueryModel();

  let fullText = '';
  let tokensIn = 0;
  let tokensOut = 0;

  for await (const event of iterateLlmStream({ client, model, systemPrompt, question })) {
    if (event.kind === 'delta') {
      fullText += event.text;
      yield { type: 'token', text: event.text };
    } else {
      tokensIn = event.tokensIn;
      tokensOut = event.tokensOut;
    }
  }

  trackStreamInference(model, tokensIn, tokensOut);

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
