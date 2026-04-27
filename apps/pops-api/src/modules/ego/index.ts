/**
 * Ego domain — conversational AI interface to Cerebrum (PRD-087).
 *
 * Procedures:
 *   ego.conversations.create/list/get/delete — CRUD (US-05)
 *   ego.chat                                 — multi-turn conversation (US-01)
 */
import { mergeRouters, router } from '../../trpc.js';
import { chatRouter, conversationsRouter } from './router.js';

export const egoRouter = mergeRouters(
  chatRouter,
  router({
    conversations: conversationsRouter,
  })
);
