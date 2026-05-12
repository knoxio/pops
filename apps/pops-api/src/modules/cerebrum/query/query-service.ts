/**
 * QueryService — pipeline orchestrator for the Cerebrum Query Engine (PRD-082).
 *
 * Methods:
 *   ask      — full NL Q&A pipeline: scope inference → retrieval → LLM → citation parsing
 *   retrieve — retrieval-only (no LLM), returns sources
 *   explain  — debug: shows what the pipeline would do without executing
 */
import { getDrizzle } from '../../../db.js';
import { getSettingValue } from '../../core/settings/service.js';
import { ContextAssemblyService } from '../retrieval/context-assembly.js';
import { HybridSearchService } from '../retrieval/hybrid-search.js';
import { CitationParser } from './citation-parser.js';
import { buildQuerySystemPrompt } from './prompts.js';
import { callQueryLlm } from './query-llm.js';
import { streamQueryAnswer } from './query-stream.js';
import { QueryScopeInferencer } from './scope-inferencer.js';

import type { RetrievalFilters, RetrievalResult } from '../retrieval/types.js';
import type { QueryStreamEvent } from './query-stream.js';
import type {
  ConfidenceLevel,
  QueryDomain,
  QueryRequest,
  QueryResponse,
  ScopeInferenceResult,
  SourceCitation,
} from './types.js';

const getQueryMaxSources = (): number => getSettingValue('cerebrum.query.maxSources', 10);
const getQueryRelevanceThreshold = (): number =>
  getSettingValue('cerebrum.query.relevanceThreshold', 0.3);
const getQueryTokenBudget = (): number => getSettingValue('cerebrum.query.tokenBudget', 4096);

const NO_INFO_ANSWER = "I don't have information about that.";

type PreparedQuery =
  | { kind: 'no-results'; scopes: string[] }
  | {
      kind: 'prepared';
      question: string;
      scopes: string[];
      results: RetrievalResult[];
      systemPrompt: string;
    };

/**
 * Emit a single-event "no results" stream so the SSE route doesn't have to
 * special-case the empty-retrieval branch.
 */
async function* emitNoResultsStream(scopes: string[]): AsyncGenerator<QueryStreamEvent> {
  yield { type: 'token', text: NO_INFO_ANSWER };
  yield {
    type: 'done',
    answer: NO_INFO_ANSWER,
    sources: [],
    scopes,
    confidence: 'low',
    tokensIn: 0,
    tokensOut: 0,
  };
}

/** Map domain names to Thalamus sourceType values. */
const DOMAIN_MAP: Record<QueryDomain, string> = {
  engrams: 'engram',
  transactions: 'transaction',
  media: 'media',
  inventory: 'inventory',
};

function computeConfidence(sources: SourceCitation[]): ConfidenceLevel {
  if (sources.length === 0) return 'low';
  const topScore = sources[0]?.relevance ?? 0;
  if (topScore > 0.8) return 'high';
  if (topScore >= 0.5) return 'medium';
  return 'low';
}

function buildRetrievalFilters(
  scopes: string[],
  includeSecret: boolean,
  domains?: QueryDomain[]
): RetrievalFilters {
  const filters: RetrievalFilters = {};

  if (scopes.length > 0) {
    filters.scopes = scopes;
  }

  if (includeSecret) {
    filters.includeSecret = true;
  }

  if (domains && domains.length > 0) {
    filters.sourceTypes = domains.map((d) => DOMAIN_MAP[d]);
  }

  return filters;
}

export class QueryService {
  private readonly inferencer = new QueryScopeInferencer();
  private readonly citationParser = new CitationParser();
  private readonly assembler = new ContextAssemblyService();

  /**
   * Full NL Q&A pipeline: infer scopes → retrieve → LLM → parse citations.
   */
  async ask(request: QueryRequest): Promise<QueryResponse> {
    const prepared = await this.prepareCommon(request);
    if (prepared.kind === 'no-results') {
      return {
        answer: NO_INFO_ANSWER,
        sources: [],
        scopes: prepared.scopes,
        confidence: 'low',
      };
    }

    // Generate answer via LLM (non-streaming).
    const llmAnswer = await callQueryLlm(prepared.systemPrompt, prepared.question);

    // Parse citations.
    const { cleanedAnswer, citations } = this.citationParser.parse(llmAnswer, prepared.results);

    // Compute confidence — downgrade if zero valid citations.
    let confidence = computeConfidence(citations);
    if (citations.length === 0) {
      confidence = 'low';
    }

    return {
      answer: cleanedAnswer,
      sources: citations,
      scopes: prepared.scopes,
      confidence,
    };
  }

  /**
   * Streaming variant of `ask()`. Performs the same retrieval and context
   * assembly pipeline up-front, then returns an async generator that yields
   * `token` events while the LLM streams and a final `done` event with
   * parsed citations + confidence.
   *
   * Used by `POST /api/cerebrum/query/stream` (PRD-082, issue #2596).
   */
  async prepareStream(request: QueryRequest): Promise<AsyncGenerator<QueryStreamEvent>> {
    const prepared = await this.prepareCommon(request);
    if (prepared.kind === 'no-results') {
      return emitNoResultsStream(prepared.scopes);
    }

    return streamQueryAnswer({
      systemPrompt: prepared.systemPrompt,
      question: prepared.question,
      retrievedResults: prepared.results,
      scopes: prepared.scopes,
    });
  }

  /**
   * Shared pre-LLM pipeline used by both the one-shot `ask()` and the
   * streaming `prepareStream()` entry points.
   */
  private async prepareCommon(request: QueryRequest): Promise<PreparedQuery> {
    const question = request.question.trim();
    const maxSources = request.maxSources ?? getQueryMaxSources();
    const includeSecret = request.includeSecret ?? false;

    const scopeResult = this.inferencer.infer(question, undefined, request.scopes, includeSecret);
    const filters = buildRetrievalFilters(scopeResult.scopes, includeSecret, request.domains);
    const hybridSearch = new HybridSearchService(getDrizzle());
    const relevanceThreshold = getQueryRelevanceThreshold();
    const results = await hybridSearch.hybrid(question, filters, maxSources, relevanceThreshold);

    if (results.length === 0) {
      return { kind: 'no-results', scopes: scopeResult.scopes };
    }

    const assembled = this.assembler.assemble({
      query: question,
      results,
      tokenBudget: getQueryTokenBudget(),
      includeMetadata: true,
    });

    return {
      kind: 'prepared',
      question,
      scopes: scopeResult.scopes,
      results,
      systemPrompt: buildQuerySystemPrompt(assembled.context),
    };
  }

  /**
   * Retrieval-only: returns sources without calling the LLM.
   */
  async retrieve(
    question: string,
    scopes?: string[],
    includeSecret?: boolean,
    maxSources?: number
  ): Promise<{ sources: SourceCitation[] }> {
    const trimmed = question.trim();
    const limit = maxSources ?? getQueryMaxSources();
    const secret = includeSecret ?? false;

    const scopeResult = this.inferencer.infer(trimmed, undefined, scopes, secret);
    const filters = buildRetrievalFilters(scopeResult.scopes, secret);
    const hybridSearch = new HybridSearchService(getDrizzle());
    const results = await hybridSearch.hybrid(
      trimmed,
      filters,
      limit,
      getQueryRelevanceThreshold()
    );

    const sources: SourceCitation[] = results.map((r) => ({
      id: r.sourceId,
      type: r.sourceType,
      title: r.title,
      excerpt: truncateExcerpt(r.contentPreview ?? ''),
      relevance: r.score,
      scope: extractPrimaryScope(r),
    }));

    return { sources };
  }

  /**
   * Debug endpoint: shows scope inference and retrieval plan without executing.
   */
  explain(question: string): {
    scopeInference: ScopeInferenceResult;
    retrievalPlan: { filters: RetrievalFilters; maxSources: number; threshold: number };
    secretNotice: string | null;
  } {
    const trimmed = question.trim();
    const scopeResult = this.inferencer.infer(trimmed);
    const filters = buildRetrievalFilters(scopeResult.scopes, false);
    const secretNotice = this.inferencer.detectSecretMention(trimmed);

    return {
      scopeInference: scopeResult,
      retrievalPlan: {
        filters,
        maxSources: getQueryMaxSources(),
        threshold: getQueryRelevanceThreshold(),
      },
      secretNotice,
    };
  }
}

/** Truncate to 200 chars at word boundary with ellipsis. */
function truncateExcerpt(text: string): string {
  if (text.length <= 200) return text;
  const truncated = text.slice(0, 200);
  const lastSpace = truncated.lastIndexOf(' ');
  const cutPoint = lastSpace > 0 ? lastSpace : 200;
  return text.slice(0, cutPoint) + '…';
}

/** Extract primary scope from retrieval result metadata. */
function extractPrimaryScope(result: { metadata: Record<string, unknown> }): string {
  const scopes = result.metadata['scopes'] as string[] | undefined;
  return scopes?.[0] ?? 'unknown';
}
