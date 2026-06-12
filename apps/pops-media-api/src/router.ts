/**
 * Root tRPC router for the media pillar container.
 *
 * Procedure paths are intentionally rooted at `media.*` so that the
 * Phase 5 PR 2 dispatcher cutover can be a transparent URL swap rather
 * than a procedure-path rename: existing pops-api clients call
 * `media.shelfImpressions.*`, and media-api answers on the same path.
 */
import { shelfImpressionsRouter } from './modules/shelf-impressions/router.js';
import { watchlistRouter } from './modules/watchlist/router.js';
import { router } from './trpc.js';

export const mediaRouter = router({
  shelfImpressions: shelfImpressionsRouter,
  watchlist: watchlistRouter,
});

export const appRouter = router({
  media: mediaRouter,
});

export type AppRouter = typeof appRouter;
