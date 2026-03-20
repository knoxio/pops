/**
 * Seed database with comprehensive test data.
 * Run with: tsx scripts/db-seed.ts
 */
import BetterSqlite3 from "better-sqlite3";
import { existsSync } from "node:fs";
import { seedDatabase } from "../src/db/seeder.js";

const DB_PATH = process.env.SQLITE_PATH ?? "./data/pops.db";

if (!existsSync(DB_PATH)) {
  console.error(`❌ Database not found at ${DB_PATH}`);
  console.log("💡 Run 'tsx scripts/init-db.ts' to create the database first");
  process.exit(1);
}

const db = new BetterSqlite3(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

console.log(`🌱 Seeding database at ${DB_PATH}...\n`);
seedDatabase(db);

const counts = {
  transactions: db.prepare("SELECT COUNT(*) as count FROM transactions").get() as { count: number },
  entities: db.prepare("SELECT COUNT(*) as count FROM entities").get() as { count: number },
  budgets: db.prepare("SELECT COUNT(*) as count FROM budgets").get() as { count: number },
  home_inventory: db.prepare("SELECT COUNT(*) as count FROM home_inventory").get() as { count: number },
  wish_list: db.prepare("SELECT COUNT(*) as count FROM wish_list").get() as { count: number },
};

console.log("\n✅ Database seeded successfully\n");
console.log("📊 Final counts:");
console.log(`  transactions:   ${counts.transactions.count}`);
console.log(`  entities:       ${counts.entities.count}`);
console.log(`  budgets:        ${counts.budgets.count}`);
console.log(`  home_inventory: ${counts.home_inventory.count}`);
console.log(`  wish_list:      ${counts.wish_list.count}`);
console.log("\n💡 Use this data for development and E2E testing");

db.close();
