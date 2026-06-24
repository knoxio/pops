/**
 * QueryService — pipeline orchestrator for the cerebrum query engine.
 *
 * Methods:
 *   ask           — full NL Q&A: scope inference → retrieval → LLM → citations
 *   prepareStream — streaming variant: same pre-LLM pipeline, then a token stream
 *   retrieve      — retrieval-only (no LLM), returns sources
 *   explain       — debug: shows what the pipeline would do without executing
 *
 * Reuses the in-pillar retrieval slice (`HybridSearchService`,
 * `ContextAssemblyService`). The LLM ports are injected so tests stay offline.
 */
import { ContextAssemblyService } from '../retrieval/context-assembly.js';
import { HybridSearchService } from '../retrieval/hybrid-search.js';
import { CitationParser } from './citation-parser.js';
import { buildQuerySystemPrompt } from './prompts.js';
import { streamQueryAnswer } from './query-stream.js';
import { QueryScopeInferencer } from './scope-inferencer.js';

import type { SemanticSearchDeps } from '../retrieval/semantic-search.js';
import type { RetrievalFilters, RetrievalResult } from '../retrieval/types.js';
import type { QueryLlm, QueryStreamLlm } from './llm.js';
import type { QueryStreamEvent } from './query-stream.js';
import type {
  ConfidenceLevel,
  QueryDomain,
  QueryRequest,
  QueryResponse,
  ScopeInferenceResult,
  SourceCitation,
} from './types.js';

const QUERY_MAX_SOURCES = 10;
const QUERY_RELEVANCE_THRESHOLD = 0.3;
const QUERY_TOKEN_BUDGET = 4096;
const EXCERPT_MAX_LENGTH = 200;

const NO_INFO_ANSWER = "I don't have information about that.";

/** Retrieval deps + the injected LLM ports the query pipeline consumes. */
export interface QueryServiceDeps extends SemanticSearchDeps {
  llm: QueryLlm;
  streamLlm: QueryStreamLlm;
}

/** Map domain names to retrieval sourceType values. */
const DOMAIN_MAP: Record<QueryDomain, string> = {
  engrams: 'engram',
  transactions: 'transaction',
  media: 'media',
  inventory: 'inventory',
};

type PreparedQuery =
  | { kind: 'no-results'; scopes: string[] }
  | {
      kind: 'prepared';
      question: string;
      scopes: string[];
      results: RetrievalResult[];
      systemPrompt: string;
    };

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
  if (scopes.length > 0) filters.scopes = scopes;
  if (includeSecret) filters.includeSecret = true;
  if (domains && domains.length > 0) filters.sourceTypes = domains.map((d) => DOMAIN_MAP[d]);
  return filters;
}

function truncateExcerpt(text: string): string {
  if (text.length <= EXCERPT_MAX_LENGTH) return text;
  const truncated = text.slice(0, EXCERPT_MAX_LENGTH);
  const lastSpace = truncated.lastIndexOf(' ');
  const cutPoint = lastSpace > 0 ? lastSpace : EXCERPT_MAX_LENGTH;
  return text.slice(0, cutPoint) + '…';
}

function extractPrimaryScope(result: { metadata: Record<string, unknown> }): string {
  const scopes = result.metadata['scopes'] as string[] | undefined;
  return scopes?.[0] ?? 'unknown';
}

export class QueryService {
  private readonly inferencer = new QueryScopeInferencer();
  private readonly citationParser = new CitationParser();
  private readonly assembler = new ContextAssemblyService();
  private readonly search: HybridSearchService;

  constructor(private readonly deps: QueryServiceDeps) {
    this.search = new HybridSearchService(deps);
  }

  /** Full NL Q&A pipeline: infer scopes → retrieve → LLM → parse citations. */
  async ask(request: QueryRequest): Promise<QueryResponse> {
    const prepared = await this.prepareCommon(request);
    if (prepared.kind === 'no-results') {
      return { answer: NO_INFO_ANSWER, sources: [], scopes: prepared.scopes, confidence: 'low' };
    }

    const llmAnswer = await this.deps.llm.complete(prepared.systemPrompt, prepared.question);
    const { cleanedAnswer, citations } = this.citationParser.parse(llmAnswer, prepared.results);

    const confidence = citations.length === 0 ? 'low' : computeConfidence(citations);

    return { answer: cleanedAnswer, sources: citations, scopes: prepared.scopes, confidence };
  }

  /**
   * Streaming variant of `ask()`. Runs the same retrieval + context assembly
   * up-front, then returns an async generator that yields `token` events while
   * the LLM streams and a final `done` event with parsed citations.
   */
  async prepareStream(request: QueryRequest): Promise<AsyncGenerator<QueryStreamEvent>> {
    const prepared = await this.prepareCommon(request);
    if (prepared.kind === 'no-results') {
      return emitNoResultsStream(prepared.scopes);
    }
    return streamQueryAnswer({
      llm: this.deps.streamLlm,
      systemPrompt: prepared.systemPrompt,
      question: prepared.question,
      retrievedResults: prepared.results,
      scopes: prepared.scopes,
    });
  }

  /** Shared pre-LLM pipeline used by both `ask()` and `prepareStream()`. */
  private async prepareCommon(request: QueryRequest): Promise<PreparedQuery> {
    const question = request.question.trim();
    const maxSources = request.maxSources ?? QUERY_MAX_SOURCES;
    const includeSecret = request.includeSecret ?? false;

    const scopeResult = this.inferencer.infer(question, undefined, request.scopes, includeSecret);
    const filters = buildRetrievalFilters(scopeResult.scopes, includeSecret, request.domains);
    const results = await this.search.hybrid(
      question,
      filters,
      maxSources,
      QUERY_RELEVANCE_THRESHOLD
    );

    if (results.length === 0) {
      return { kind: 'no-results', scopes: scopeResult.scopes };
    }

    const assembled = this.assembler.assemble({
      query: question,
      results,
      tokenBudget: QUERY_TOKEN_BUDGET,
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

  /** Retrieval-only: returns sources without calling the LLM. */
  async retrieve(
    question: string,
    scopes?: string[],
    includeSecret?: boolean,
    maxSources?: number
  ): Promise<{ sources: SourceCitation[] }> {
    const trimmed = question.trim();
    const limit = maxSources ?? QUERY_MAX_SOURCES;
    const secret = includeSecret ?? false;

    const scopeResult = this.inferencer.infer(trimmed, undefined, scopes, secret);
    const filters = buildRetrievalFilters(scopeResult.scopes, secret);
    const results = await this.search.hybrid(trimmed, filters, limit, QUERY_RELEVANCE_THRESHOLD);

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

  /** Debug: shows scope inference + retrieval plan without executing. */
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
        maxSources: QUERY_MAX_SOURCES,
        threshold: QUERY_RELEVANCE_THRESHOLD,
      },
      secretNotice,
    };
  }
}
