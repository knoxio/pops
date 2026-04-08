import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const tagVocabulary = sqliteTable(
  "tag_vocabulary",
  {
    tag: text("tag").primaryKey(),
    source: text("source", { enum: ["seed", "user"] })
      .notNull()
      .default("seed"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index("idx_tag_vocabulary_active").on(table.isActive)]
);
