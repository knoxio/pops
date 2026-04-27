/**
 * tRPC router for ego — conversations CRUD + chat.
 *
 * Conversations CRUD is a thin adapter over ConversationPersistence.
 * Chat delegates to the ConversationEngine for the LLM pipeline.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { getDrizzle } from '../../db.js';
import { protectedProcedure, router } from '../../trpc.js';
import { ConversationEngine } from './engine.js';
import { PersistenceStoreAdapter } from './persistence-store.js';
import { ConversationPersistence } from './persistence.js';
import { autoTitle } from './types.js';

import type { AppContext, ChatResult, Conversation, Message } from './types.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/** Lazily instantiated persistence service (uses the global Drizzle instance). */
function getPersistence(): ConversationPersistence {
  return new ConversationPersistence({ db: getDrizzle() });
}

function getStore(): PersistenceStoreAdapter {
  return new PersistenceStoreAdapter(getPersistence());
}

function getEngine(): ConversationEngine {
  return new ConversationEngine();
}

/**
 * Check whether two AppContext values differ (by value, not reference).
 * Returns true if the incoming context is meaningfully different from stored.
 */
function appContextChanged(
  stored: AppContext | undefined | null,
  incoming: AppContext | undefined
): boolean {
  if (!stored && !incoming) return false;
  if (!stored || !incoming) return true;
  return (
    stored.app !== incoming.app ||
    stored.route !== incoming.route ||
    stored.entityId !== incoming.entityId ||
    stored.entityType !== incoming.entityType
  );
}

interface PersistChatParams {
  persistence: ConversationPersistence;
  conversationId: string;
  userMessage: string;
  result: ChatResult;
  storedAppContext?: AppContext | null;
  incomingAppContext?: AppContext;
}

/** Persist chat results: scope changes, app context changes, messages, and engram context. */
function persistChatResults(params: PersistChatParams): Message {
  const { persistence, conversationId, userMessage, result } = params;

  if (result.scopeNegotiation?.changed) {
    persistence.updateScopes(conversationId, result.scopeNegotiation.scopes);
  }

  // US-03: Detect app context change and persist it.
  if (appContextChanged(params.storedAppContext, params.incomingAppContext)) {
    persistence.updateAppContext(conversationId, params.incomingAppContext ?? null);
  }

  persistence.appendMessage(conversationId, { role: 'user', content: userMessage });

  const assistantMsg = persistence.appendMessage(conversationId, {
    role: 'assistant',
    content: result.response.content,
    citations: result.response.citations,
    tokensIn: result.response.tokensIn,
    tokensOut: result.response.tokensOut,
  });

  for (const { engramId, relevanceScore } of result.retrievedEngrams) {
    persistence.upsertContext(conversationId, engramId, relevanceScore);
  }

  return assistantMsg;
}

interface ResolveConversationParams {
  store: PersistenceStoreAdapter;
  persistence: ConversationPersistence;
  conversationId: string | undefined;
  message: string;
  scopes: string[];
  appContext: AppContext | undefined;
}

/** Load an existing conversation or create a new one. */
async function resolveConversation(params: ResolveConversationParams): Promise<Conversation> {
  const { store, persistence, conversationId, message, scopes, appContext } = params;
  if (conversationId) {
    const existing = await store.getConversation(conversationId);
    if (existing) return existing;
  }
  return persistence.createConversation({
    title: autoTitle(message),
    scopes,
    appContext,
    model: DEFAULT_MODEL,
  });
}

const createSchema = z.object({
  title: z.string().min(1).optional(),
  scopes: z.array(z.string().min(1)).optional(),
  appContext: z.unknown().optional(),
  model: z.string().min(1),
});

const listSchema = z
  .object({
    limit: z.number().int().positive().max(200).optional(),
    offset: z.number().int().nonnegative().optional(),
    search: z.string().optional(),
  })
  .optional();

const getSchema = z.object({
  id: z.string().min(1),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

const appContextSchema = z
  .object({
    app: z.string(),
    route: z.string().optional(),
    entityId: z.string().optional(),
    entityType: z.string().optional(),
  })
  .optional();

const channelSchema = z.enum(['shell', 'moltbot', 'mcp', 'cli']).optional();

const chatInputSchema = z.object({
  conversationId: z.string().min(1).optional(),
  message: z.string().min(1),
  scopes: z.array(z.string().min(1)).optional(),
  appContext: appContextSchema,
  channel: channelSchema,
  knownScopes: z.array(z.string().min(1)).optional(),
});

export const chatRouter = router({
  chat: protectedProcedure.input(chatInputSchema).mutation(async ({ input }) => {
    const store = getStore();
    const engine = getEngine();
    const persistence = getPersistence();

    const scopes = input.scopes ?? [];
    const appContext: AppContext | undefined = input.appContext ?? undefined;

    const conversation = await resolveConversation({
      store,
      persistence,
      conversationId: input.conversationId,
      message: input.message,
      scopes,
      appContext,
    });
    const history = await store.getMessages(conversation.id);

    let result: ChatResult;
    try {
      result = await engine.chat({
        conversationId: conversation.id,
        message: input.message,
        history,
        activeScopes: conversation.activeScopes,
        appContext: conversation.appContext as AppContext | undefined,
        channel: input.channel ?? 'shell',
        knownScopes: input.knownScopes,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message });
    }

    const assistantMsg = persistChatResults({
      persistence,
      conversationId: conversation.id,
      userMessage: input.message,
      result,
      storedAppContext: conversation.appContext as AppContext | undefined | null,
      incomingAppContext: appContext,
    });

    return {
      conversationId: conversation.id,
      response: assistantMsg,
      retrievedEngrams: result.retrievedEngrams,
      scopeNegotiation: result.scopeNegotiation ?? null,
    };
  }),
});

export const conversationsRouter = router({
  create: protectedProcedure.input(createSchema).mutation(({ input }) => {
    const conversation = getPersistence().createConversation(input);
    return { conversation };
  }),

  list: protectedProcedure.input(listSchema).query(({ input }) => {
    return getPersistence().listConversations(input ?? {});
  }),

  get: protectedProcedure.input(getSchema).query(({ input }) => {
    const result = getPersistence().getConversation(input.id);
    if (!result) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Conversation '${input.id}' not found`,
      });
    }
    return result;
  }),

  delete: protectedProcedure.input(deleteSchema).mutation(({ input }) => {
    getPersistence().deleteConversation(input.id);
    return { success: true };
  }),
});
