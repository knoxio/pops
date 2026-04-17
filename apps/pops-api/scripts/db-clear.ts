import { existsSync } from 'node:fs';

/**
 * Clear all data from database while preserving schema
 * Run with: tsx scripts/db-clear.ts
 */
import BetterSqlite3 from 'better-sqlite3';

import { resetToBareMinimum } from '../src/db/data-reset.js';
import { assertNotProduction, assertLowRecordCount } from './lib/guard.js';

assertNotProduction();

const DB_PATH = process.env.SQLITE_PATH ?? './data/pops.db';

if (!existsSync(DB_PATH)) {
  console.error(`❌ Database not found at ${DB_PATH}`);
  console.log("💡 Run 'tsx scripts/init-db.ts' to create the database first");
  process.exit(1);
}

const db = new BetterSqlite3(DB_PATH);

// Set pragmas
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

assertLowRecordCount(db);

console.log('🧹 Clearing all application data and restoring bare-minimum system rows...');

resetToBareMinimum(db);

const counts = {
  transactions: db.prepare('SELECT COUNT(*) as count FROM transactions').get() as { count: number },
  entities: db.prepare('SELECT COUNT(*) as count FROM entities').get() as { count: number },
  movies: db.prepare('SELECT COUNT(*) as count FROM movies').get() as { count: number },
  watch_history: db.prepare('SELECT COUNT(*) as count FROM watch_history').get() as {
    count: number;
  },
  settings: db.prepare('SELECT COUNT(*) as count FROM settings').get() as { count: number },
  tag_vocabulary: db.prepare('SELECT COUNT(*) as count FROM tag_vocabulary').get() as {
    count: number;
  },
  rotation_sources: db.prepare('SELECT COUNT(*) as count FROM rotation_sources').get() as {
    count: number;
  },
};

console.log('✅ Database reset to bare minimum\n');
console.log('📊 Spot checks (user data should be 0; system seeds non-zero):');
console.log(`  transactions:     ${counts.transactions.count}`);
console.log(`  entities:         ${counts.entities.count}`);
console.log(`  movies:           ${counts.movies.count}`);
console.log(`  watch_history:    ${counts.watch_history.count}`);
console.log(`  settings:         ${counts.settings.count}`);
console.log(`  tag_vocabulary:   ${counts.tag_vocabulary.count}`);
console.log(`  rotation_sources: ${counts.rotation_sources.count}`);

db.close();
