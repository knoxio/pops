/**
 * Finance domain — transactions, budgets, imports, wishlist.
 */
import { router } from "../../trpc.js";
import { transactionsRouter } from "./transactions/router.js";

// Side-effect: register search adapters
import "./transactions/search-adapter.js";
import "./budgets/search-adapter.js";
import { budgetsRouter } from "./budgets/router.js";
import { importsRouter } from "./imports/router.js";
import { wishlistRouter } from "./wishlist/router.js";

export const financeRouter = router({
  transactions: transactionsRouter,
  budgets: budgetsRouter,
  imports: importsRouter,
  wishlist: wishlistRouter,
});
