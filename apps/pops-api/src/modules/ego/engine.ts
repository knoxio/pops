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
import { callChatLlm, callSummariseLlm } from './llm-client.js';
import { buildEgoSystemPrompt, buildSummarisationPrompt } from './prompts.js';
import { ConversationScopeNegotiator } from './scope-negotiator.js';

import type { RetrievalFilters, RetrievalResult } from '../cerebrum/retrieval/types.js';
import type { ChatParams, ChatResult, EngineConfig, Message, ScopeNegotiation } from './types.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_HISTORY = 20;
const DEFAULT_MAX_RETRIEVAL = 5;
const DEFAULT_TOKEN_BUDGET = 4096;
const DEFAULT_RELEVANCE_THRESHOLD = 0.3;

function isSecretScope(scope: string): boolean {
  return scope.split('.').includes('secret');
}

function buildRetrievalFilters(scopes: string[]): RetrievalFilters {
  const filters: RetrievalFilters = {};
  if (scopes.length > 0) {
    filters.scopes = scopes;
  }
  if (scopes.some(isSecretScope)) {
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
  private readonly scopeNegotiator = new ConversationScopeNegotiator();

  constructor(config?: Partial<EngineConfig>) {
    this.config = buildDefaultConfig(config);
  }

  /** Process a user message and generate a response. */
  async chat(params: ChatParams): Promise<ChatResult> {
    const { message, history, appContext } = params;

    // Run scope negotiation to potentially adjust scopes.
    const negotiation = this.negotiateScopes(params);
    const effectiveScopes = negotiation.scopes;

    // US-03: Bias scopes towards the active app context (additive).
    const biasedScopes = biasScopes(effectiveScopes, appContext);

    // US-03: Auto-load viewed engram when user is viewing one in Cerebrum.
    const viewedEngram = loadViewedEngram(appContext);

    const retrievalResults = await this.retrieveEngrams(message, biasedScopes);

    // Prepend the viewed engram if it wasn't already retrieved.
    const allResults = this.mergeViewedEngram(viewedEngram, retrievalResults);

    const { systemPrompt, contextBlock } = this.buildContextWindow(
      allResults,
      effectiveScopes,
      appContext
    );

    // If scopes changed or there's a secret notice, prepend info to response.
    const scopeNotice = this.buildScopeNotice(negotiation);
    const llmMessages = this.buildLlmMessages(history, message, contextBlock);
    const llmResponse = await callChatLlm(this.config.model, systemPrompt, llmMessages);
    const { cleanedAnswer, citations } = this.citationParser.parse(llmResponse.content, allResults);

    const responseContent = scopeNotice ? `${scopeNotice}\n\n${cleanedAnswer}` : cleanedAnswer;

    return {
      response: {
        content: responseContent,
        citations: citations.map((c) => c.id),
        tokensIn: llmResponse.tokensIn,
        tokensOut: llmResponse.tokensOut,
      },
      retrievedEngrams: allResults.map((r) => ({
        engramId: r.sourceId,
        relevanceScore: r.score,
      })),
      scopeNegotiation: negotiation,
    };
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
