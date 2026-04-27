/**
 * Ego domain — AI conversation persistence and retrieval.
 */
import { router } from '../../trpc.js';
import { conversationsRouter } from './router.js';

export const egoRouter = router({
  conversations: conversationsRouter,
});
