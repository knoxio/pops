import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { transactions } from "./transactions.js";
import { entities } from "./entities.js";

export const homeInventory = sqliteTable("home_inventory", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  notionId: text("notion_id").unique(),
  itemName: text("item_name").notNull(),
  brand: text("brand"),
  model: text("model"),
  itemId: text("item_id"),
  room: text("room"),
  location: text("location"),
  type: text("type"),
  condition: text("condition"),
  inUse: integer("in_use"),
  deductible: integer("deductible"),
  purchaseDate: text("purchase_date"),
  warrantyExpires: text("warranty_expires"),
  replacementValue: real("replacement_value"),
  resaleValue: real("resale_value"),
  purchaseTransactionId: text("purchase_transaction_id").references(
    () => transactions.id,
    { onDelete: "set null" }
  ),
  purchasedFromId: text("purchased_from_id").references(() => entities.id, {
    onDelete: "set null",
  }),
  purchasedFromName: text("purchased_from_name"),
  lastEditedTime: text("last_edited_time").notNull(),
});
