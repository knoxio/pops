/**
 * GenerationService — pipeline orchestrator for document generation (PRD-083).
 *
 * Methods:
 *   generate         — full generation pipeline for any mode
 *   generateReport   — shorthand for report mode
 *   generateSummary  — shorthand for summary mode
 *   generateTimeline — shorthand for timeline mode
 *   preview          — dry run returning sources + outline
 *
 * Reuses retrieval infrastructure from PRD-082 (HybridSearchService,
 * ContextAssemblyService, CitationParser).
 */
import { getDrizzle } from '../../../db.js';
import { getSettingValue } from '../../core/settings/service.js';
import { CitationParser } from '../query/citation-parser.js';
import { ContextAssemblyService } from '../retrieval/context-assembly.js';
import { HybridSearchService } from '../retrieval/hybrid-search.js';
import { toSourceCitations } from './helpers.js';
import { callEmitLlm } from './llm.js';
import { checkReportSources, buildReportDocument } from './modes/report.js';
import { buildEmptySummary, capSummaryResults, buildSummaryDocument } from './modes/summary.js';
import { sortChronologically, buildTimelineDocument } from './modes/timeline.js';
import {
  buildReportPrompt,
  buildOutlinePrompt,
  buildSummaryPrompt,
  buildTimelinePrompt,
} from './prompts.js';
import { buildScopeFilters, computeDefaultAudienceScope, filterByScope } from './scope-filter.js';

import type { RetrievalFilters, RetrievalResult } from '../retrieval/types.js';
import type { GenerationRequest, GenerationResult, PreviewResult } from './types.js';

function getEmitTokenBudget(): number {
  return getSettingValue('cerebrum.emit.tokenBudget', 8192);
}

function getEmitRelevanceThreshold(): number {
  return getSettingValue('cerebrum.emit.relevanceThreshold', 0.2);
}

function getEmitMaxSources(): number {
  return getSettingValue('cerebrum.emit.maxSources', 20);
}

/**
 * Build retrieval filters from a generation request.
 */
function buildFiltersFromRequest(request: GenerationRequest): RetrievalFilters {
  const base: RetrievalFilters = { sourceTypes: ['engram'] };
  if (request.types?.length) base.types = request.types;
  if (request.tags?.length) base.tags = request.tags;
  if (request.dateRange)
    base.dateRange = { from: request.dateRange.from, to: request.dateRange.to };
  if (request.scopes?.length) base.scopes = request.scopes;
  return buildScopeFilters(base, request.audienceScope, request.includeSecret ?? false);
}

export class GenerationService {
  private readonly citationParser = new CitationParser();
  private readonly assembler = new ContextAssemblyService();

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
      tokenBudget: getEmitTokenBudget(),
      includeMetadata: true,
    });

    const prompt = buildReportPrompt(assembled.context, audienceScope);
    const llmOutput = await callEmitLlm(prompt, query);
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
      tokenBudget: getEmitTokenBudget(),
      includeMetadata: true,
    });

    const prompt = buildSummaryPrompt(assembled.context, effectiveDateRange, audienceScope);
    const llmOutput = await callEmitLlm(prompt, query);
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
      tokenBudget: getEmitTokenBudget(),
      includeMetadata: true,
    });

    const prompt = buildTimelinePrompt(assembled.context, audienceScope, request.groupBy);
    const llmOutput = await callEmitLlm(prompt, query);
    const { cleanedAnswer } = this.citationParser.parse(llmOutput, sorted);

    return { document: buildTimelineDocument(cleanedAnswer, sorted, audienceScope) };
  }

  /** Preview: returns sources and a generated outline without full document generation. */
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
      tokenBudget: getEmitTokenBudget(),
      includeMetadata: true,
    });
    const outline = await callEmitLlm(buildOutlinePrompt(assembled.context), query);
    return { sources, outline };
  }

  /** Run hybrid search against Thalamus. */
  private async retrieve(query: string, filters: RetrievalFilters): Promise<RetrievalResult[]> {
    const hybridSearch = new HybridSearchService(getDrizzle());
    return hybridSearch.hybrid(query, filters, getEmitMaxSources(), getEmitRelevanceThreshold());
  }
}
