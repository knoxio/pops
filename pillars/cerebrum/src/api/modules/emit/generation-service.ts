/**
 * GenerationService — pipeline orchestrator for document generation.
 * Spec: pillars/cerebrum/docs/prds/document-generation.
 *
 * Reuses the in-pillar retrieval slice (`HybridSearchService`,
 * `ContextAssemblyService`) and the query slice's `CitationParser`. The LLM
 * port is injected so tests stay offline. Tunables are constants here — the
 * pillar has no settings service.
 */
import { CitationParser } from '../query/citation-parser.js';
import { ContextAssemblyService } from '../retrieval/context-assembly.js';
import { HybridSearchService } from '../retrieval/hybrid-search.js';
import { toSourceCitations } from './helpers.js';
import { buildReportDocument, checkReportSources } from './modes/report.js';
import { buildEmptySummary, buildSummaryDocument, capSummaryResults } from './modes/summary.js';
import { buildTimelineDocument, sortChronologically } from './modes/timeline.js';
import {
  buildOutlinePrompt,
  buildReportPrompt,
  buildSummaryPrompt,
  buildTimelinePrompt,
} from './prompts.js';
import { buildScopeFilters, computeDefaultAudienceScope, filterByScope } from './scope-filter.js';

import type { SemanticSearchDeps } from '../retrieval/semantic-search.js';
import type { RetrievalFilters, RetrievalResult } from '../retrieval/types.js';
import type { GenerationLlm } from './llm.js';
import type { GenerationRequest, GenerationResult, PreviewResult } from './types.js';

const EMIT_TOKEN_BUDGET = 8192;
const EMIT_RELEVANCE_THRESHOLD = 0.2;
const EMIT_MAX_SOURCES = 20;

/** Retrieval deps + the injected LLM port the generation pipeline consumes. */
export interface GenerationServiceDeps extends SemanticSearchDeps {
  llm: GenerationLlm;
}

/** Build retrieval filters from a generation request. */
function buildFiltersFromRequest(request: GenerationRequest): RetrievalFilters {
  const base: RetrievalFilters = { sourceTypes: ['engram'] };
  if (request.types?.length) base.types = request.types;
  if (request.tags?.length) base.tags = request.tags;
  if (request.dateRange) {
    base.dateRange = { from: request.dateRange.from, to: request.dateRange.to };
  }
  if (request.scopes?.length) base.scopes = request.scopes;
  return buildScopeFilters(base, request.audienceScope, request.includeSecret ?? false);
}

export class GenerationService {
  private readonly citationParser = new CitationParser();
  private readonly assembler = new ContextAssemblyService();
  private readonly search: HybridSearchService;

  constructor(private readonly deps: GenerationServiceDeps) {
    this.search = new HybridSearchService(deps);
  }

  /** Full generation pipeline: retrieve -> scope filter -> synthesise -> format. */
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    switch (request.mode) {
      case 'report':
        return this.generateReport(request);
      case 'summary':
        return this.generateSummary(request);
      case 'timeline':
        return this.generateTimeline(request);
    }
  }

  /** Generate a structured report from a query. */
  async generateReport(request: GenerationRequest): Promise<GenerationResult> {
    const query = request.query ?? '';
    const includeSecret = request.includeSecret ?? false;
    const filters = buildFiltersFromRequest(request);
    const results = await this.retrieve(query, filters);
    const filtered = filterByScope(results, request.audienceScope, includeSecret);

    const insufficientCheck = checkReportSources(filtered);
    if (insufficientCheck) return insufficientCheck;

    const audienceScope = request.audienceScope ?? computeDefaultAudienceScope(filtered);
    const assembled = this.assembler.assemble({
      query,
      results: filtered,
      tokenBudget: EMIT_TOKEN_BUDGET,
      includeMetadata: true,
    });

    const prompt = buildReportPrompt(assembled.context, audienceScope);
    const llmOutput = await this.deps.llm.generate(prompt, query);
    const { cleanedAnswer, citations } = this.citationParser.parse(llmOutput, filtered);

    return { document: buildReportDocument(cleanedAnswer, citations, audienceScope, filtered) };
  }

  /** Generate a summary digest over a date range. */
  async generateSummary(request: GenerationRequest): Promise<GenerationResult> {
    const includeSecret = request.includeSecret ?? false;
    const query = request.query ?? 'summary of all content';
    const filters = buildFiltersFromRequest(request);
    const results = await this.retrieve(query, filters);
    const filtered = filterByScope(results, request.audienceScope, includeSecret);
    const audienceScope = request.audienceScope ?? computeDefaultAudienceScope(filtered);
    const effectiveDateRange = request.dateRange ?? { from: 'unknown', to: 'unknown' };

    if (filtered.length === 0) {
      return { document: buildEmptySummary(effectiveDateRange, audienceScope) };
    }

    const { capped, truncated } = capSummaryResults(filtered);
    const assembled = this.assembler.assemble({
      query,
      results: capped,
      tokenBudget: EMIT_TOKEN_BUDGET,
      includeMetadata: true,
    });

    const prompt = buildSummaryPrompt(assembled.context, effectiveDateRange, audienceScope);
    const llmOutput = await this.deps.llm.generate(prompt, query);
    const { cleanedAnswer } = this.citationParser.parse(llmOutput, capped);

    return {
      document: buildSummaryDocument({
        llmOutput: cleanedAnswer,
        results: capped,
        dateRange: effectiveDateRange,
        audienceScope,
        truncated,
      }),
    };
  }

  /** Generate a chronological timeline from dated engrams. */
  async generateTimeline(request: GenerationRequest): Promise<GenerationResult> {
    const includeSecret = request.includeSecret ?? false;
    const query = request.query ?? 'timeline of all events';
    const filters = buildFiltersFromRequest(request);
    const results = await this.retrieve(query, filters);
    const filtered = filterByScope(results, request.audienceScope, includeSecret);
    const audienceScope = request.audienceScope ?? computeDefaultAudienceScope(filtered);

    if (filtered.length === 0) {
      return { document: null, notice: 'No relevant engrams found for this timeline' };
    }

    const sorted = sortChronologically(filtered);
    const assembled = this.assembler.assemble({
      query,
      results: sorted,
      tokenBudget: EMIT_TOKEN_BUDGET,
      includeMetadata: true,
    });

    const prompt = buildTimelinePrompt(assembled.context, audienceScope, request.groupBy);
    const llmOutput = await this.deps.llm.generate(prompt, query);
    const { cleanedAnswer } = this.citationParser.parse(llmOutput, sorted);

    return { document: buildTimelineDocument(cleanedAnswer, sorted, audienceScope) };
  }

  /** Preview: returns sources and a generated outline without full generation. */
  async preview(request: GenerationRequest): Promise<PreviewResult> {
    const query = request.query ?? 'preview';
    const includeSecret = request.includeSecret ?? false;
    const filters = buildFiltersFromRequest(request);
    const results = await this.retrieve(query, filters);
    const filtered = filterByScope(results, request.audienceScope, includeSecret);
    const sources = toSourceCitations(filtered);

    if (filtered.length === 0) {
      return { sources, outline: 'No sources found — cannot generate outline.' };
    }

    const assembled = this.assembler.assemble({
      query,
      results: filtered,
      tokenBudget: EMIT_TOKEN_BUDGET,
      includeMetadata: true,
    });
    const outline = await this.deps.llm.generate(buildOutlinePrompt(assembled.context), query);
    return { sources, outline };
  }

  /** Run hybrid search against the in-pillar retrieval slice. */
  private async retrieve(query: string, filters: RetrievalFilters): Promise<RetrievalResult[]> {
    return this.search.hybrid(query, filters, EMIT_MAX_SOURCES, EMIT_RELEVANCE_THRESHOLD);
  }
}
