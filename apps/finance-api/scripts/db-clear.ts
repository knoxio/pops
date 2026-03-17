/**
 * Clear all data from database while preserving schema
 * Run with: tsx scripts/db-clear.ts
 */
import BetterSqlite3 from "better-sqlite3";
import { existsSync } from "node:fs";

const DB_PATH = process.env.SQLITE_PATH ?? "./data/pops.db";

if (!existsSync(DB_PATH)) {
  console.error(`❌ Database not found at ${DB_PATH}`);
  console.log("💡 Run 'tsx scripts/init-db.ts' to create the database first");
  process.exit(1);
}

const db = new BetterSqlite3(DB_PATH);

// Set pragmas
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

console.log("🧹 Clearing database...");

// Clear all tables
const clearTransaction = db.transaction(() => {
  db.exec(`DELETE FROM transactions`);
  db.exec(`DELETE FROM entities`);
  db.exec(`DELETE FROM budgets`);
  db.exec(`DELETE FROM home_inventory`);
  db.exec(`DELETE FROM wish_list`);
  db.exec(`DELETE FROM transaction_corrections`);
});

clearTransaction();

// Get counts to verify
const counts = {
  transactions: db.prepare("SELECT COUNT(*) as count FROM transactions").get() as { count: number },
  entities: db.prepare("SELECT COUNT(*) as count FROM entities").get() as { count: number },
  budgets: db.prepare("SELECT COUNT(*) as count FROM budgets").get() as { count: number },
  home_inventory: db.prepare("SELECT COUNT(*) as count FROM home_inventory").get() as { count: number },
  wish_list: db.prepare("SELECT COUNT(*) as count FROM wish_list").get() as { count: number },
  transaction_corrections: db.prepare("SELECT COUNT(*) as count FROM transaction_corrections").get() as { count: number },
};

console.log("✅ Database cleared successfully\n");
console.log("📊 Table counts:");
console.log(`  transactions:           ${counts.transactions.count}`);
console.log(`  entities:               ${counts.entities.count}`);
console.log(`  budgets:                ${counts.budgets.count}`);
console.log(`  home_inventory:         ${counts.home_inventory.count}`);
console.log(`  wish_list:              ${counts.wish_list.count}`);
console.log(`  transaction_corrections:${counts.transaction_corrections.count}`);

db.close();
