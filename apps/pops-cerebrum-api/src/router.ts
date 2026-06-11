/**
 * Root tRPC router for the cerebrum pillar container.
 *
 * Procedure paths are rooted at `cerebrum.*` so that the Phase 5 PR 2
 * dispatcher cutover is a transparent URL swap: existing pops-api
 * clients call `cerebrum.nudges.list`, and cerebrum-api answers on the
 * same path.
 */
import { nudgesRouter } from './modules/nudges/router.js';
import { router } from './trpc.js';

export const cerebrumRouter = router({
  nudges: nudgesRouter,
});

export const appRouter = router({
  cerebrum: cerebrumRouter,
});

export type AppRouter = typeof appRouter;
