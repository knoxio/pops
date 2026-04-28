/**
 * QueryService — pipeline orchestrator for the Cerebrum Query Engine (PRD-082).
 *
 * Methods:
 *   ask      — full NL Q&A pipeline: scope inference → retrieval → LLM → citation parsing
 *   retrieve — retrieval-only (no LLM), returns sources
 *   explain  — debug: shows what the pipeline would do without executing
 */
import Anthropic from '@anthropic-ai/sdk';

import { getDrizzle } from '../../../db.js';
import { getEnv } from '../../../env.js';
import { withRateLimitRetry } from '../../../lib/ai-retry.js';
import { trackInference } from '../../../lib/inference-middleware.js';
import { logger } from '../../../lib/logger.js';
import { getSettingValue } from '../../core/settings/service.js';
import { ContextAssemblyService } from '../retrieval/context-assembly.js';
import { HybridSearchService } from '../retrieval/hybrid-search.js';
import { CitationParser } from './citation-parser.js';
import { buildQuerySystemPrompt } from './prompts.js';
import { QueryScopeInferencer } from './scope-inferencer.js';

import type { RetrievalFilters } from '../retrieval/types.js';
import type {
  ConfidenceLevel,
  QueryDomain,
  QueryRequest,
  QueryResponse,
  ScopeInferenceResult,
  SourceCitation,
} from './types.js';

const OPERATION = 'cerebrum.query';

function getQueryModel(): string {
  return getSettingValue('cerebrum.query.model', 'claude-sonnet-4-20250514');
}

function getQueryMaxSources(): number {
  return getSettingValue('cerebrum.query.maxSources', 10);
}

function getQueryRelevanceThreshold(): number {
  return getSettingValue('cerebrum.query.relevanceThreshold', 0.3);
}

function getQueryTokenBudget(): number {
  return getSettingValue('cerebrum.query.tokenBudget', 4096);
}

const NO_INFO_ANSWER = "I don't have information about that.";

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
    const question = request.question.trim();
    const maxSources = request.maxSources ?? getQueryMaxSources();
    const includeSecret = request.includeSecret ?? false;

    // 1. Scope inference.
    const scopeResult = this.inferencer.infer(question, undefined, request.scopes, includeSecret);

    // 2. Build filters and retrieve.
    const filters = buildRetrievalFilters(scopeResult.scopes, includeSecret, request.domains);
    const hybridSearch = new HybridSearchService(getDrizzle());
    const relevanceThreshold = getQueryRelevanceThreshold();
    const results = await hybridSearch.hybrid(question, filters, maxSources, relevanceThreshold);

    // 3. Zero results → short-circuit.
    if (results.length === 0) {
      return {
        answer: NO_INFO_ANSWER,
        sources: [],
        scopes: scopeResult.scopes,
        confidence: 'low',
      };
    }

    // 4. Assemble context for LLM.
    const assembled = this.assembler.assemble({
      query: question,
      results,
      tokenBudget: getQueryTokenBudget(),
      includeMetadata: true,
    });

    // 5. Generate answer via LLM.
    const systemPrompt = buildQuerySystemPrompt(assembled.context);
    const llmAnswer = await this.callLlm(systemPrompt, question);

    // 6. Parse citations.
    const { cleanedAnswer, citations } = this.citationParser.parse(llmAnswer, results);

    // 7. Compute confidence — downgrade if zero valid citations.
    let confidence = computeConfidence(citations);
    if (citations.length === 0) {
      confidence = 'low';
    }

    return {
      answer: cleanedAnswer,
      sources: citations,
      scopes: scopeResult.scopes,
      confidence,
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

  /** Call the LLM for answer generation. Gracefully degrades if API key is missing. */
  private async callLlm(systemPrompt: string, question: string): Promise<string> {
    const apiKey = getEnv('ANTHROPIC_API_KEY');
    if (!apiKey) {
      logger.warn('[QueryEngine] ANTHROPIC_API_KEY not set — returning retrieval-only answer');
      return "I don't have enough information to answer that fully. (LLM unavailable)";
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const model = getQueryModel();

    try {
      const response = await trackInference(
        { provider: 'claude', model, operation: OPERATION, domain: 'cerebrum' },
        () =>
          withRateLimitRetry(
            () =>
              client.messages.create({
                model,
                max_tokens: 1024,
                temperature: 0,
                system: systemPrompt,
                messages: [{ role: 'user', content: question }],
              }),
            OPERATION,
            { logger, logPrefix: '[QueryEngine]' }
          )
      );

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
      return text;
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        '[QueryEngine] LLM call failed'
      );
      return "I don't have enough information to answer that fully. (LLM error)";
    }
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
