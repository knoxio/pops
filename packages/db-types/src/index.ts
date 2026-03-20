/**
 * Shared database types for POPS SQLite schema.
 * Types are inferred from Drizzle ORM schema definitions (single source of truth).
 */
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { entities } from "./schema/entities.js";
import type { transactions } from "./schema/transactions.js";
import type { budgets } from "./schema/budgets.js";
import type { homeInventory } from "./schema/inventory.js";
import type { wishList } from "./schema/wishlist.js";

// ── Select types (what you get back from queries) ──

export type EntityRow = InferSelectModel<typeof entities>;
export type TransactionRow = InferSelectModel<typeof transactions>;
export type BudgetRow = InferSelectModel<typeof budgets>;
export type InventoryRow = InferSelectModel<typeof homeInventory>;
export type WishListRow = InferSelectModel<typeof wishList>;

// ── Insert types (what you pass to create) ──

export type EntityInsert = InferInsertModel<typeof entities>;
export type TransactionInsert = InferInsertModel<typeof transactions>;
export type BudgetInsert = InferInsertModel<typeof budgets>;
export type InventoryInsert = InferInsertModel<typeof homeInventory>;
export type WishListInsert = InferInsertModel<typeof wishList>;

// ── Constants ──

/** Supported entity types — extensible via new values, not schema changes. */
export const ENTITY_TYPES = [
  "company",
  "person",
  "place",
  "brand",
  "organisation",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

/** Wish list priority levels, ordered from most to least urgent. */
export const WISH_LIST_PRIORITIES = [
  "Needing",
  "Soon",
  "One Day",
  "Dreaming",
] as const;

export type WishListPriority = (typeof WISH_LIST_PRIORITIES)[number];
