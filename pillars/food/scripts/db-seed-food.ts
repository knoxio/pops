/**
 * Food-only seed runner (PRD-113 phase 1 + 3).
 *
 * Wipes food tables in the SQLite file at `SQLITE_PATH` (or the dev
 * default `./data/pops.db` relative to `apps/pops-api`) and invokes
 * `seedFood`. Distinct from `apps/pops-api/scripts/db-seed.ts` — leaves
 * finance, inventory, media, and ai_inference rows alone.
 *
 * Run via `mise run db:seed:food` from the repo root. The mise task `cd`s
 * into `apps/pops-api` so `./data/pops.db` resolves correctly without an
 * env override.
 */
import { existsSync } from 'node:fs';

import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { compileRecipeVersion } from '../src/dsl/compile.js';
import { seedFood } from '../src/seed/index.js';

if (process.env.NODE_ENV === 'production') {
  console.error("❌ Refusing to run: NODE_ENV is 'production'.");
  console.error('   This script is for development/testing only.');
  process.exit(1);
}

const DB_PATH = process.env.SQLITE_PATH ?? './data/pops.db';

if (!existsSync(DB_PATH)) {
  console.error(`❌ Database not found at ${DB_PATH}`);
  console.warn("💡 Run 'mise db:init' to create the database first");
  process.exit(1);
}

// Wipe only food tables. Children first; `foreign_keys = OFF` makes the
// order purely defensive. PRD-116 (recipe_lines / recipe_steps /
// recipe_version_proposed_slugs) and PRD-123 (unit_conversions /
// ingredient_weights) tables are wiped too so re-running the seed stays
// idempotent — the conversion tables carry a UNIQUE on (from_unit,to_unit)
// / a partial UNIQUE on (ingredient_id, variant_id, unit) that would
// otherwise collide on the second run.
const FOOD_TABLES = [
  'batch_consumptions',
  'recipe_runs',
  'batches',
  'plan_entries',
  'plan_slots',
  'substitutions',
  'recipe_tags',
  'recipe_lines',
  'recipe_steps',
  'recipe_version_proposed_slugs',
  'recipe_versions',
  'recipes',
  'ingredient_weights',
  'unit_conversions',
  'ingredient_tags',
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

console.warn(`🌱 Seeding food fixtures at ${DB_PATH}...\n`);

db.pragma('foreign_keys = OFF');
try {
  db.transaction(() => {
    for (const table of FOOD_TABLES) {
      db.exec(`DELETE FROM "${table}"`);
    }
    const drizzleDb = drizzle(db);
    // Phase 2: drive PRD-116's compile + PRD-107's promote inline so the
    // seed DB ends up with materialised recipe_lines / recipe_steps and
    // every recipe's v1 promoted to `current`.
    const summary = seedFood(drizzleDb, { compileRecipeVersion });
    console.warn('\n✅ Food seed complete\n');
    console.warn('📊 Counts:');
    const printRow = (label: string, value: number): void => {
      // Pad to one space past the widest label so values line up regardless
      // of which counters are present in the summary.
      console.warn(`  ${`${label}:`.padEnd(21)}${value}`);
    };
    printRow('prep_states', summary.prepStates);
    printRow('ingredients', summary.ingredients);
    printRow('variants', summary.variants);
    printRow('aliases', summary.aliases);
    printRow('substitutions', summary.substitutions);
    printRow('plan_slots', summary.planSlots);
    printRow('plan_entries', summary.planEntries);
    printRow('recipes', summary.recipes);
    printRow('recipe_versions', summary.recipeVersions);
    printRow('batches', summary.batches);
    printRow('recipe_runs', summary.recipeRuns);
    printRow('batch_consumptions', summary.batchConsumptions);
    printRow('ingest_sources', summary.ingestSources);
    printRow('unit_conversions', summary.unitConversions);
    printRow('ingredient_weights', summary.ingredientWeights);
    printRow('ingredient_tags', summary.ingredientTags);
  })();
} finally {
  db.pragma('foreign_keys = ON');
}

db.close();
