/**
 * Context sub-router for ego — scope management + context state (PRD-087 US-03, US-04).
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { getDrizzle } from '../../db.js';
import { protectedProcedure, router } from '../../trpc.js';
import { ConversationPersistence } from './persistence.js';

import type { AppContext } from './types.js';

function getPersistence(): ConversationPersistence {
  return new ConversationPersistence({ db: getDrizzle() });
}

const setScopesSchema = z.object({
  conversationId: z.string().min(1),
  scopes: z.array(z.string()),
});

const getActiveSchema = z.object({
  conversationId: z.string().min(1),
});

/** Context sub-router: scope management + context state (PRD-087 US-03, US-04). */
export const contextRouter = router({
  setScopes: protectedProcedure.input(setScopesSchema).mutation(({ input }) => {
    const persistence = getPersistence();
    const existing = persistence.getConversation(input.conversationId);
    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Conversation '${input.conversationId}' not found`,
      });
    }
    persistence.updateScopes(input.conversationId, input.scopes);
    return { scopes: input.scopes };
  }),

  /** US-03: Return the current context state for a conversation. */
  getActive: protectedProcedure.input(getActiveSchema).query(({ input }) => {
    const persistence = getPersistence();
    const existing = persistence.getConversation(input.conversationId);
    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Conversation '${input.conversationId}' not found`,
      });
    }
    const contextEntries = persistence.getContextEntries(input.conversationId);
    return {
      scopes: existing.conversation.activeScopes,
      appContext: existing.conversation.appContext as AppContext | null,
      engrams: contextEntries.map((entry) => ({
        engramId: entry.engramId,
        relevanceScore: entry.relevanceScore,
        loadedAt: entry.loadedAt,
      })),
    };
  }),
});
