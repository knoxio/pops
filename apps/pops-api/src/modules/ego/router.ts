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

import type { AppContext } from './types.js';

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

const chatInputSchema = z.object({
  conversationId: z.string().min(1).optional(),
  message: z.string().min(1),
  scopes: z.array(z.string().min(1)).optional(),
  appContext: appContextSchema,
});

export const chatRouter = router({
  chat: protectedProcedure.input(chatInputSchema).mutation(async ({ input }) => {
    const store = getStore();
    const engine = getEngine();
    const persistence = getPersistence();

    const scopes = input.scopes ?? [];
    const appContext: AppContext | undefined = input.appContext ?? undefined;

    // Load or create conversation.
    let conversationId = input.conversationId;
    let conversation = conversationId ? await store.getConversation(conversationId) : null;

    if (!conversation) {
      conversation = persistence.createConversation({
        title: autoTitle(input.message),
        scopes,
        appContext: appContext ?? undefined,
        model: DEFAULT_MODEL,
      });
      conversationId = conversation.id;
    }

    // Load message history.
    const history = await store.getMessages(conversation.id);

    // Run the conversation engine.
    let result;
    try {
      result = await engine.chat({
        conversationId: conversation.id,
        message: input.message,
        history,
        activeScopes: conversation.activeScopes,
        appContext: conversation.appContext as AppContext | undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message });
    }

    // Persist user message.
    persistence.appendMessage(conversation.id, {
      role: 'user',
      content: input.message,
    });

    // Persist assistant response.
    const assistantMsg = persistence.appendMessage(conversation.id, {
      role: 'assistant',
      content: result.response.content,
      citations: result.response.citations,
      tokensIn: result.response.tokensIn,
      tokensOut: result.response.tokensOut,
    });

    // Record retrieved engrams in context.
    for (const { engramId, relevanceScore } of result.retrievedEngrams) {
      persistence.upsertContext(conversation.id, engramId, relevanceScore);
    }

    return {
      conversationId: conversation.id,
      response: assistantMsg,
      retrievedEngrams: result.retrievedEngrams,
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
