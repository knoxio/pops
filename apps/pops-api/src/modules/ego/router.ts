/**
 * tRPC router for ego.conversations.
 *
 * Thin adapter over ConversationPersistence — no database work lives here.
 * All business logic belongs to the persistence service.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { getDrizzle } from '../../db.js';
import { protectedProcedure, router } from '../../trpc.js';
import { ConversationPersistence } from './persistence.js';

/** Lazily instantiated persistence service (uses the global Drizzle instance). */
function getPersistence(): ConversationPersistence {
  return new ConversationPersistence({ db: getDrizzle() });
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
