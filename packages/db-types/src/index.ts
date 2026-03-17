/**
 * Shared database types for POPS SQLite schema.
 * Used by finance-api to ensure type consistency.
 */
export { TransactionRowSchema, type TransactionRow } from "./transactions.js";
export { EntityRowSchema, type EntityRow } from "./entities.js";
export { BudgetRowSchema, type BudgetRow } from "./budgets.js";
export { InventoryRowSchema, type InventoryRow } from "./inventory.js";
export {
  WishListRowSchema,
  WISH_LIST_PRIORITIES,
  type WishListRow,
  type WishListPriority,
} from "./wishlist.js";
