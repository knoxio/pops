/**
 * ConversationEngine — multi-turn conversation manager for Ego (PRD-087 US-01, US-03).
 *
 * Orchestrates the chat pipeline: scope negotiation, Thalamus retrieval,
 * context window assembly, LLM call, citation parsing, and token tracking.
 */
import { getDrizzle } from '../../db.js';
import { logger } from '../../lib/logger.js';
import { CitationParser } from '../cerebrum/query/citation-parser.js';
import { ContextAssemblyService } from '../cerebrum/retrieval/context-assembly.js';
import { HybridSearchService } from '../cerebrum/retrieval/hybrid-search.js';
import { biasScopes, loadViewedEngram } from './context-helpers.js';
import {
  buildDefaultConfig,
  buildRetrievalFilters,
  formatHistoryForContext,
} from './engine-helpers.js';
import { generateStreamEvents } from './engine-stream.js';
import { callChatLlm, callSummariseLlm } from './llm-client.js';
import { buildEgoSystemPrompt, buildSummarisationPrompt } from './prompts.js';
import { ConversationScopeNegotiator } from './scope-negotiator.js';

import type { RetrievalResult } from '../cerebrum/retrieval/types.js';
import type {
  ChatParams,
  ChatResult,
  ChatStreamPreparation,
  EngineConfig,
  Message,
  ScopeNegotiation,
} from './types.js';

export class ConversationEngine {
  private readonly config: EngineConfig;
  private readonly citationParser = new CitationParser();
  private readonly assembler = new ContextAssemblyService();
  private readonly scopeNegotiator = new ConversationScopeNegotiator();

  constructor(config?: Partial<EngineConfig>) {
    this.config = buildDefaultConfig(config);
  }

  /** Process a user message and generate a response. */
  async chat(params: ChatParams): Promise<ChatResult> {
    const ctx = await this.assembleContext(params);
    const llmResponse = await callChatLlm(this.config.model, ctx.systemPrompt, ctx.llmMessages);
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
        model: this.config.model,
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

  /** Shared context assembly: scope negotiation, retrieval, context window, LLM messages. */
  private async assembleContext(params: ChatParams): Promise<{
    negotiation: ScopeNegotiation;
    allResults: RetrievalResult[];
    systemPrompt: string;
    scopeNotice: string | null;
    llmMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  }> {
    const { message, history, appContext } = params;
    const negotiation = this.negotiateScopes(params);
    const biasedScopes = biasScopes(negotiation.scopes, appContext);
    const viewedEngram = loadViewedEngram(appContext);
    const retrievalResults = await this.retrieveEngrams(message, biasedScopes);
    const allResults = this.mergeViewedEngram(viewedEngram, retrievalResults);
    const { systemPrompt, contextBlock } = this.buildContextWindow(
      allResults,
      negotiation.scopes,
      appContext
    );
    const scopeNotice = this.buildScopeNotice(negotiation);
    const llmMessages = this.buildLlmMessages(history, message, contextBlock);
    return { negotiation, allResults, systemPrompt, scopeNotice, llmMessages };
  }

  /** Summarise older conversation messages into a condensed block. */
  async summariseHistory(messages: Message[]): Promise<string> {
    const formatted = formatHistoryForContext(messages);
    const prompt = buildSummarisationPrompt(formatted);
    return callSummariseLlm(this.config.model, prompt, messages.length);
  }

  /**
   * Run scope negotiation for the current message.
   */
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

  /**
   * Build a user-facing notice string when scopes changed or secret content
   * was mentioned.
   */
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

  /**
   * Merge the auto-loaded viewed engram with retrieval results.
   * Prepends it if not already present (avoids duplicates).
   */
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
      const hybridSearch = new HybridSearchService(getDrizzle());
      return await hybridSearch.hybrid(
        query,
        filters,
        this.config.maxRetrievalResults,
        this.config.relevanceThreshold
      );
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        '[Ego] Thalamus retrieval failed — continuing without engram context'
      );
      return [];
    }
  }

  private buildContextWindow(
    retrievalResults: RetrievalResult[],
    scopes: string[],
    appContext?: { app: string; route?: string; entityId?: string; entityType?: string }
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

  private buildLlmMessages(
    history: Message[],
    currentMessage: string,
    contextBlock: string
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const recentHistory = history.slice(-this.config.maxHistoryMessages);

    for (const msg of recentHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    const userContent = contextBlock
      ? `${currentMessage}\n\n---\nRetrieved knowledge:\n${contextBlock}`
      : currentMessage;
    messages.push({ role: 'user', content: userContent });
    return messages;
  }
}
