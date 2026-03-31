/**
 * Audit SQLite database — print statistics and data quality checks.
 *
 * Usage: pnpm audit
 */
import Database from 'better-sqlite3';

interface CountRow {
  count: number;
}

interface AccountRow {
  account: string;
  count: number;
  earliest: string;
  latest: string;
}

interface CategoryRow {
  category: string;
  count: number;
}

interface OrphanRow {
  count: number;
}

function getDbPath(): string {
  const dbPath = process.env['SQLITE_DB_PATH'];
  if (!dbPath) {
    console.error('SQLITE_DB_PATH environment variable is required');
    process.exit(1);
  }
  return dbPath;
}

function main(): void {
  const dbPath = getDbPath();
  const db = new Database(dbPath, { readonly: true });

  console.log(`[audit] Database: ${dbPath}\n`);

  // Record counts
  const tables = ['transactions', 'entities', 'budgets', 'inventory', 'wish_list'] as const;
  console.log('=== Record Counts ===');
  for (const table of tables) {
    try {
      const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as CountRow;
      console.log(`  ${table}: ${row.count}`);
    } catch {
      console.log(`  ${table}: (table not found)`);
    }
  }

  // Transactions by account
  console.log('\n=== Transactions by Account ===');
  try {
    const rows = db
      .prepare(
        `SELECT account, COUNT(*) as count, MIN(date) as earliest, MAX(date) as latest
       FROM transactions GROUP BY account ORDER BY count DESC`
      )
      .all() as AccountRow[];
    for (const row of rows) {
      console.log(`  ${row.account}: ${row.count} (${row.earliest} → ${row.latest})`);
    }
  } catch {
    console.log('  (transactions table not found)');
  }

  // Top categories
  console.log('\n=== Top Categories ===');
  try {
    const rows = db
      .prepare(
        `SELECT category, COUNT(*) as count FROM transactions
       WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC LIMIT 10`
      )
      .all() as CategoryRow[];
    for (const row of rows) {
      console.log(`  ${row.category}: ${row.count}`);
    }
  } catch {
    console.log('  (transactions table not found)');
  }

  // Data quality: transactions without entities
  console.log('\n=== Data Quality ===');
  try {
    const noEntity = db
      .prepare(`SELECT COUNT(*) as count FROM transactions WHERE entity_id IS NULL`)
      .get() as OrphanRow;
    console.log(`  Transactions without entity: ${noEntity.count}`);
  } catch {
    console.log('  (could not check entity linkage)');
  }

  // Entities without transactions
  try {
    const orphanEntities = db
      .prepare(
        `SELECT COUNT(*) as count FROM entities e
       WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.entity_id = e.id)`
      )
      .get() as OrphanRow;
    console.log(`  Entities without transactions: ${orphanEntities.count}`);
  } catch {
    console.log('  (could not check orphan entities)');
  }

  db.close();
  console.log('\n[audit] Done.');
}

main();
