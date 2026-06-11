/**
 * Root tRPC router for the finance pillar container.
 *
 * The procedure paths are intentionally rooted at `finance.*` so the
 * Phase 5 PR 2 dispatcher cutover can be a transparent URL swap rather
 * than a procedure-path rename: existing pops-api clients call
 * `finance.wishlist.list` / `finance.budgets.create` /
 * `finance.transactions.update`, and finance-api answers on the same
 * paths.
 *
 * Scope note: this PR ships the wishlist + budgets subrouters in full,
 * plus the CRUD slice of transactions (list/get/create/update/delete/
 * restore). Transactions' `suggestTags` / `listDescriptionsForPreview`
 * / `availableTags` and the entire `imports` subrouter stay on the
 * legacy pops-api router as fall-through because they reach into
 * cross-pillar surfaces (`core/corrections`, `core/tag-rules`,
 * `core/ai-usage`, `core/settings`, `shared/tag-suggester`, and the
 * legacy unified `pops.db` drizzle handle) that haven't moved yet —
 * see the procedure-by-procedure breakdown in `modules/transactions/router.ts`.
 */
import { budgetsRouter } from './modules/budgets/router.js';
import { transactionsRouter } from './modules/transactions/router.js';
import { wishlistRouter } from './modules/wishlist/router.js';
import { router } from './trpc.js';

export const financeRouter = router({
  wishlist: wishlistRouter,
  budgets: budgetsRouter,
  transactions: transactionsRouter,
});

export const appRouter = router({
  finance: financeRouter,
});

export type AppRouter = typeof appRouter;
