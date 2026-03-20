import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const environments = sqliteTable(
  "environments",
  {
    // CHECK: name != 'prod'
    name: text("name").primaryKey(),
    dbPath: text("db_path").notNull(),
    seedType: text("seed_type", { enum: ["none", "test"] })
      .notNull()
      .default("none"),
    ttlSeconds: integer("ttl_seconds"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    expiresAt: text("expires_at"),
  },
  (table) => [index("idx_environments_expires_at").on(table.expiresAt)]
);
