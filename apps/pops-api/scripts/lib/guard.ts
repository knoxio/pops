/**
 * Production safety guards for destructive database scripts.
 *
 * Prevents accidental execution against production databases by checking
 * NODE_ENV and optionally verifying the database has few enough records
 * to be a dev/test instance.
 */
import type BetterSqlite3 from "better-sqlite3";

const DEFAULT_THRESHOLD = 1000;

/**
 * Block execution if NODE_ENV is "production".
 * Exits the process with a non-zero code.
 */
export function assertNotProduction(): void {
  if (process.env.NODE_ENV === "production") {
    console.error("❌ Refusing to run: NODE_ENV is 'production'.");
    console.error("   This script is for development/testing only.");
    process.exit(1);
  }
}

/**
 * Check that the transactions table has fewer rows than `threshold`.
 * If it exceeds the threshold, block unless `--force` is passed.
 */
export function assertLowRecordCount(
  db: BetterSqlite3.Database,
  threshold = DEFAULT_THRESHOLD
): void {
  const row = db.prepare("SELECT COUNT(*) as count FROM transactions").get() as { count: number };

  if (row.count > threshold) {
    const hasForce = process.argv.includes("--force");
    if (!hasForce) {
      console.error(`❌ Database has ${row.count} transactions (threshold: ${threshold}).`);
      console.error("   This looks like a real database. Pass --force to override.");
      db.close();
      process.exit(1);
    }
    console.warn(`⚠️  Proceeding with --force despite ${row.count} transactions.`);
  }
}
