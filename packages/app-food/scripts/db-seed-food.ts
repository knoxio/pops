/**
 * Food-only seed runner (PRD-113 phase 1 + 3).
 *
 * Wipes food + lists tables in the SQLite file at `SQLITE_PATH` (or the dev
 * default `./apps/pops-api/data/pops.db` relative to the repo root) and
 * invokes `seedFood`. Distinct from `apps/pops-api/scripts/db-seed.ts` —
 * leaves finance, inventory, media, and ai_inference rows alone.
 *
 * Run via `mise run db:seed:food` from the repo root. The mise task `cd`s
 * into `apps/pops-api` so `./data/pops.db` resolves correctly without an
 * env override.
 */
import { existsSync } from 'node:fs';

import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { seedFood } from '@pops/app-food-db/seed';

if (process.env.NODE_ENV === 'production') {
  console.error("❌ Refusing to run: NODE_ENV is 'production'.");
  console.error('   This script is for development/testing only.');
  process.exit(1);
}

const DB_PATH = process.env.SQLITE_PATH ?? './data/pops.db';

if (!existsSync(DB_PATH)) {
  console.error(`❌ Database not found at ${DB_PATH}`);
  console.log("💡 Run 'mise db:init' to create the database first");
  process.exit(1);
}

// Wipe only food + lists tables. Children first; `foreign_keys = OFF` makes
// the order purely defensive.
const FOOD_AND_LISTS_TABLES = [
  'list_items',
  'lists',
  'batch_consumptions',
  'recipe_runs',
  'batches',
  'plan_entries',
  'plan_slots',
  'substitutions',
  'recipe_tags',
  'recipe_versions',
  'recipes',
  'ingredient_aliases',
  'ingredient_variants',
  'prep_states',
  'ingredients',
  'ingest_sources',
  'slug_registry',
] as const;

const db = new BetterSqlite3(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

console.log(`🌱 Seeding food + lists fixtures at ${DB_PATH}...\n`);

db.pragma('foreign_keys = OFF');
try {
  db.transaction(() => {
    for (const table of FOOD_AND_LISTS_TABLES) {
      db.exec(`DELETE FROM "${table}"`);
    }
    const drizzleDb = drizzle(db);
    const summary = seedFood(drizzleDb, drizzleDb);
    console.log('\n✅ Food seed complete\n');
    console.log('📊 Counts:');
    console.log(`  prep_states:       ${summary.prepStates}`);
    console.log(`  ingredients:       ${summary.ingredients}`);
    console.log(`  variants:          ${summary.variants}`);
    console.log(`  aliases:           ${summary.aliases}`);
    console.log(`  substitutions:     ${summary.substitutions}`);
    console.log(`  plan_slots:        ${summary.planSlots}`);
    console.log(`  plan_entries:      ${summary.planEntries}`);
    console.log(`  recipes:           ${summary.recipes}`);
    console.log(`  recipe_versions:   ${summary.recipeVersions}`);
    console.log(`  batches:           ${summary.batches}`);
    console.log(`  recipe_runs:       ${summary.recipeRuns}`);
    console.log(`  batch_consumptions:${summary.batchConsumptions}`);
    console.log(`  lists:             ${summary.lists}`);
    console.log(`  list_items:        ${summary.listItems}`);
    console.log(`  ingest_sources:    ${summary.ingestSources}`);
  })();
} finally {
  db.pragma('foreign_keys = ON');
}

db.close();
