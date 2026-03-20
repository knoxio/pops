import { sqliteTable, text, real, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { entities } from "./entities.js";

export const transactionCorrections = sqliteTable(
  "transaction_corrections",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    descriptionPattern: text("description_pattern").notNull(),
    matchType: text("match_type", { enum: ["exact", "contains", "regex"] })
      .notNull()
      .default("exact"),
    entityId: text("entity_id").references(() => entities.id, {
      onDelete: "set null",
    }),
    entityName: text("entity_name"),
    location: text("location"),
    tags: text("tags").notNull().default("[]"),
    transactionType: text("transaction_type", {
      enum: ["purchase", "transfer", "income"],
    }),
    // CHECK: confidence >= 0.0 AND confidence <= 1.0
    confidence: real("confidence").notNull().default(0.5),
    timesApplied: integer("times_applied").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    lastUsedAt: text("last_used_at"),
  },
  (table) => [
    index("idx_corrections_pattern").on(table.descriptionPattern),
    // Note: SQL schema uses DESC sort order on these indexes;
    // Drizzle's index().on() does not support sort direction
    index("idx_corrections_confidence").on(table.confidence),
    index("idx_corrections_times_applied").on(table.timesApplied),
  ]
);

// Note: The SQL schema also defines a view:
//   CREATE VIEW v_active_corrections AS
//   SELECT * FROM transaction_corrections
//   WHERE confidence >= 0.7
//   ORDER BY confidence DESC, times_applied DESC;
// Drizzle views require separate handling — not represented here.
