import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";

export const budgets = sqliteTable("budgets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  notionId: text("notion_id").unique(),
  category: text("category").notNull(),
  period: text("period").notNull(),
  amount: real("amount"),
  active: integer("active").notNull().default(1),
  notes: text("notes"),
  lastEditedTime: text("last_edited_time").notNull(),
});
