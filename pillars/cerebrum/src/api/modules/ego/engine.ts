/**
 * ConversationEngine — multi-turn conversation manager for ego.
 *
 * Orchestrates the chat pipeline: scope negotiation, retrieval (HybridSearch),
 * context-window assembly, the LLM call, and citation parsing. All external
 * dependencies are injected ports: the {@link EgoLlm} (Anthropic in prod, fake
 * in tests), the retrieval deps backing {@link HybridSearchService}, and the
 * {@link EngramService} used for viewed-engram auto-load.
 */
import { ContextAssemblyService } from '../retrieval/context-assembly.js';
import { HybridSearchService } from '../retrieval/hybrid-search.js';
import { CitationParser } from './citation-parser.js';
import { biasScopes, loadViewedEngram } from './context-helpers.js';
import {
  buildDefaultConfig,
  buildLlmMessages,
  buildRetrievalFilters,
  formatHistoryForContext,
} from './engine-helpers.js';
import { generateStreamEvents } from './engine-stream.js';
import { buildEgoSystemPrompt, buildSummarisationPrompt } from './prompts.js';
import { ConversationScopeNegotiator } from './scope-negotiator.js';

import type { EngramService } from '../engrams/service.js';
import type { SemanticSearchDeps } from '../retrieval/semantic-search.js';
import type { RetrievalResult } from '../retrieval/types.js';
import type { EgoChatMessage, EgoLlm } from './llm.js';
import type {
  AppContext,
  ChatParams,
  ChatResult,
  ChatStreamPreparation,
  EngineConfig,
  Message,
  ScopeNegotiation,
} from './types.js';

export interface EngineDeps {
  llm: EgoLlm;
  /** Retrieval deps used to build a per-call HybridSearchService. */
  search: SemanticSearchDeps;
  engramService: EngramService;
  config?: Partial<EngineConfig>;
}

export class ConversationEngine {
  private readonly config: EngineConfig;
  private readonly citationParser = new CitationParser();
  private readonly assembler = new ContextAssemblyService();
  private readonly scopeNegotiator = new ConversationScopeNegotiator();
  private readonly llm: EgoLlm;
  private readonly search: SemanticSearchDeps;
  private readonly engramService: EngramService;

  constructor(deps: EngineDeps) {
    this.config = buildDefaultConfig(deps.config);
    this.llm = deps.llm;
    this.search = deps.search;
    this.engramService = deps.engramService;
  }

  /** Process a user message and generate a response. */
  async chat(params: ChatParams): Promise<ChatResult> {
    const ctx = await this.assembleContext(params);
    const llmResponse = await this.llm.chat(ctx.systemPrompt, ctx.llmMessages);
    const { cleanedAnswer, citations } = this.citationParser.parse(
      llmResponse.content,
      ctx.allResults
    );
    const responseContent = ctx.scopeNotice
      ? `${ctx.scopeNotice}\n\n${cleanedAnswer}`
      : cleanedAnswer;

    return {
      response: {
        content: responseContent,
        citations: citations.map((c) => c.id),
        tokensIn: llmResponse.tokensIn,
        tokensOut: llmResponse.tokensOut,
      },
      retrievedEngrams: ctx.allResults.map((r) => ({
        engramId: r.sourceId,
        relevanceScore: r.score,
      })),
      scopeNegotiation: ctx.negotiation,
    };
  }

  /** Prepare a streaming chat response. Returns metadata + an async event generator. */
  async prepareStream(params: ChatParams): Promise<ChatStreamPreparation> {
    const ctx = await this.assembleContext(params);
    return {
      stream: generateStreamEvents({
        llm: this.llm,
        systemPrompt: ctx.systemPrompt,
        llmMessages: ctx.llmMessages,
        scopeNotice: ctx.scopeNotice,
        allResults: ctx.allResults,
      }),
      retrievedEngrams: ctx.allResults.map((r) => ({
        engramId: r.sourceId,
        relevanceScore: r.score,
      })),
      scopeNegotiation: ctx.negotiation,
    };
  }

  /** Summarise older conversation messages into a condensed block. */
  async summariseHistory(messages: Message[]): Promise<string> {
    const formatted = formatHistoryForContext(messages);
    const prompt = buildSummarisationPrompt(formatted);
    return this.llm.summarise(prompt, messages.length);
  }

  private async assembleContext(params: ChatParams): Promise<{
    negotiation: ScopeNegotiation;
    allResults: RetrievalResult[];
    systemPrompt: string;
    scopeNotice: string | null;
    llmMessages: EgoChatMessage[];
  }> {
    const { message, history, appContext } = params;
    const negotiation = this.negotiateScopes(params);
    const biasedScopes = biasScopes(negotiation.scopes, appContext);
    const viewedEngram = loadViewedEngram(this.engramService, appContext);
    const retrievalResults = await this.retrieveEngrams(message, biasedScopes);
    const allResults = this.mergeViewedEngram(viewedEngram, retrievalResults);
    const { systemPrompt, contextBlock } = this.buildContextWindow(
      allResults,
      negotiation.scopes,
      appContext
    );
    const scopeNotice = this.buildScopeNotice(negotiation);
    const llmMessages = buildLlmMessages(
      history,
      message,
      contextBlock,
      this.config.maxHistoryMessages
    );
    return { negotiation, allResults, systemPrompt, scopeNotice, llmMessages };
  }

  private negotiateScopes(params: ChatParams): ScopeNegotiation {
    const { message, activeScopes, history, channel, knownScopes } = params;
    const result = this.scopeNegotiator.negotiate({
      message,
      currentScopes: activeScopes,
      conversationHistory: history,
      channel: channel ?? 'shell',
      knownScopes,
    });
    const secretNotice = this.scopeNegotiator.detectSecretMention(message);
    return {
      scopes: result.scopes,
      changed: result.changed,
      reason: result.reason,
      secretNotice,
    };
  }

  private buildScopeNotice(negotiation: ScopeNegotiation): string | null {
    const parts: string[] = [];
    if (negotiation.changed && negotiation.reason) {
      parts.push(`*${negotiation.reason}*`);
    }
    if (negotiation.secretNotice) {
      parts.push(negotiation.secretNotice);
    }
    return parts.length > 0 ? parts.join('\n\n') : null;
  }

  private mergeViewedEngram(
    viewedEngram: RetrievalResult | null,
    retrievalResults: RetrievalResult[]
  ): RetrievalResult[] {
    if (!viewedEngram) return retrievalResults;
    const alreadyRetrieved = retrievalResults.some((r) => r.sourceId === viewedEngram.sourceId);
    if (alreadyRetrieved) return retrievalResults;
    return [viewedEngram, ...retrievalResults];
  }

  private async retrieveEngrams(query: string, scopes: string[]): Promise<RetrievalResult[]> {
    try {
      const filters = buildRetrievalFilters(scopes);
      const hybridSearch = new HybridSearchService(this.search);
      return await hybridSearch.hybrid(
        query,
        filters,
        this.config.maxRetrievalResults,
        this.config.relevanceThreshold
      );
    } catch (err) {
      console.warn(
        `[cerebrum-ego] retrieval failed — continuing without engram context: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return [];
    }
  }

  private buildContextWindow(
    retrievalResults: RetrievalResult[],
    scopes: string[],
    appContext?: AppContext
  ): { systemPrompt: string; contextBlock: string } {
    const systemPrompt = buildEgoSystemPrompt(scopes, appContext);
    let contextBlock = '';
    if (retrievalResults.length > 0) {
      const assembled = this.assembler.assemble({
        query: '',
        results: retrievalResults,
        tokenBudget: this.config.tokenBudget,
        includeMetadata: true,
      });
      contextBlock = assembled.context;
    }
    return { systemPrompt, contextBlock };
  }
}
