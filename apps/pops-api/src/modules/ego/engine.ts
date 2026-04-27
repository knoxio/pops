/**
 * ConversationEngine — multi-turn conversation manager for Ego (PRD-087 US-01, US-03).
 *
 * Orchestrates the chat pipeline: Thalamus retrieval, context window assembly,
 * LLM call, citation parsing, and token tracking. Supports app-context-aware
 * scope biasing and automatic engram loading (US-03).
 */
import { getDrizzle } from '../../db.js';
import { logger } from '../../lib/logger.js';
import { getEngramService } from '../cerebrum/instance.js';
import { CitationParser } from '../cerebrum/query/citation-parser.js';
import { ContextAssemblyService } from '../cerebrum/retrieval/context-assembly.js';
import { HybridSearchService } from '../cerebrum/retrieval/hybrid-search.js';
import { callChatLlm, callSummariseLlm } from './llm-client.js';
import { buildEgoSystemPrompt, buildSummarisationPrompt } from './prompts.js';

import type { RetrievalFilters, RetrievalResult } from '../cerebrum/retrieval/types.js';
import type { AppContext, ChatParams, ChatResult, EngineConfig, Message } from './types.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_HISTORY = 20;
const DEFAULT_MAX_RETRIEVAL = 5;
const DEFAULT_TOKEN_BUDGET = 4096;
const DEFAULT_RELEVANCE_THRESHOLD = 0.3;

/**
 * Maps pops app names to their corresponding scope prefixes for retrieval biasing.
 * When the user is in a specific app, these scopes are additively merged into
 * the retrieval filters to improve relevance.
 */
const APP_SCOPE_MAP: Record<string, string> = {
  finance: 'personal.finance',
  media: 'personal.media',
  inventory: 'personal.inventory',
};

function isSecretScope(scope: string): boolean {
  return scope.split('.').includes('secret');
}

/**
 * Build retrieval filters from active scopes, optionally biasing toward
 * app-context-relevant scopes (additive, not replacing existing scopes).
 */
function buildRetrievalFilters(scopes: string[], appContext?: AppContext): RetrievalFilters {
  const filters: RetrievalFilters = {};

  const mergedScopes = [...scopes];

  if (appContext?.app) {
    const appScope = APP_SCOPE_MAP[appContext.app];
    if (appScope && !mergedScopes.includes(appScope)) {
      mergedScopes.push(appScope);
    }
  }

  if (mergedScopes.length > 0) {
    filters.scopes = mergedScopes;
  }
  if (mergedScopes.some(isSecretScope)) {
    filters.includeSecret = true;
  }
  return filters;
}

function roleLabel(role: string): string {
  if (role === 'user') return 'User';
  if (role === 'assistant') return 'Assistant';
  return 'System';
}

function formatHistoryForContext(messages: Message[]): string {
  return messages.map((m) => `${roleLabel(m.role)}: ${m.content}`).join('\n\n');
}

function buildDefaultConfig(config?: Partial<EngineConfig>): EngineConfig {
  return {
    model: config?.model ?? DEFAULT_MODEL,
    maxHistoryMessages: config?.maxHistoryMessages ?? DEFAULT_MAX_HISTORY,
    maxRetrievalResults: config?.maxRetrievalResults ?? DEFAULT_MAX_RETRIEVAL,
    tokenBudget: config?.tokenBudget ?? DEFAULT_TOKEN_BUDGET,
    relevanceThreshold: config?.relevanceThreshold ?? DEFAULT_RELEVANCE_THRESHOLD,
  };
}

export class ConversationEngine {
  private readonly config: EngineConfig;
  private readonly citationParser = new CitationParser();
  private readonly assembler = new ContextAssemblyService();

  constructor(config?: Partial<EngineConfig>) {
    this.config = buildDefaultConfig(config);
  }

  /** Process a user message and generate a response. */
  async chat(params: ChatParams): Promise<ChatResult> {
    const { message, history, activeScopes, appContext } = params;

    const retrievalResults = await this.retrieveEngrams(message, activeScopes, appContext);

    // Auto-load viewed engram when the user is viewing one in Cerebrum (US-03).
    const viewedEngramResult = await this.loadViewedEngram(appContext);
    const allResults = viewedEngramResult
      ? [viewedEngramResult, ...retrievalResults]
      : retrievalResults;

    const { systemPrompt, contextBlock } = this.buildContextWindow(
      allResults,
      activeScopes,
      appContext
    );
    const llmMessages = this.buildLlmMessages(history, message, contextBlock);
    const llmResponse = await callChatLlm(this.config.model, systemPrompt, llmMessages);
    const { cleanedAnswer, citations } = this.citationParser.parse(llmResponse.content, allResults);

    return {
      response: {
        content: cleanedAnswer,
        citations: citations.map((c) => c.id),
        tokensIn: llmResponse.tokensIn,
        tokensOut: llmResponse.tokensOut,
      },
      retrievedEngrams: allResults.map((r) => ({
        engramId: r.sourceId,
        relevanceScore: r.score,
      })),
    };
  }

  /** Summarise older conversation messages into a condensed block. */
  async summariseHistory(messages: Message[]): Promise<string> {
    const formatted = formatHistoryForContext(messages);
    const prompt = buildSummarisationPrompt(formatted);
    return callSummariseLlm(this.config.model, prompt, messages.length);
  }

  private async retrieveEngrams(
    query: string,
    scopes: string[],
    appContext?: AppContext
  ): Promise<RetrievalResult[]> {
    try {
      const filters = buildRetrievalFilters(scopes, appContext);
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

  /**
   * When the user is viewing an engram (appContext.entityType === 'engram'),
   * auto-load it as a synthetic RetrievalResult with maximum relevance (1.0).
   * Returns null if not viewing an engram or if the read fails.
   */
  private async loadViewedEngram(appContext?: AppContext): Promise<RetrievalResult | null> {
    if (appContext?.entityType !== 'engram' || !appContext.entityId) {
      return null;
    }

    try {
      const { engram, body } = getEngramService().read(appContext.entityId);
      return {
        sourceType: 'engram',
        sourceId: engram.id,
        title: engram.title,
        contentPreview: body,
        score: 1.0,
        matchType: 'semantic',
        metadata: {
          type: engram.type,
          scopes: engram.scopes,
          tags: engram.tags,
          createdAt: engram.created,
        },
      };
    } catch (err) {
      logger.warn(
        { engramId: appContext.entityId, error: err instanceof Error ? err.message : String(err) },
        '[Ego] Failed to auto-load viewed engram — continuing without it'
      );
      return null;
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
