/**
 * ANZ CSV import script.
 * Imports transactions from ANZ Everyday and ANZ Frequent Flyer Black accounts.
 *
 * Usage: pnpm import:anz --csv path/to/anz-export.csv [--execute]
 * Without --execute, runs in dry-run mode (no writes to database).
 */

import type { RunMode } from './lib/types.js';

function parseArgs(): { csvPath: string; mode: RunMode } {
  const args = process.argv.slice(2);
  const csvIndex = args.indexOf('--csv');
  const csvPath = csvIndex >= 0 ? args[csvIndex + 1] : undefined;
  const mode: RunMode = args.includes('--execute') ? 'execute' : 'dry-run';

  if (!csvPath) {
    console.error('Usage: pnpm import:anz --csv <path> [--execute]');
    process.exit(1);
  }

  return { csvPath, mode };
}

async function main(): Promise<void> {
  const { csvPath, mode } = parseArgs();
  console.log(`[import-anz] CSV: ${csvPath}, Mode: ${mode}`);

  // TODO: Migrate implementation from ~/Downloads/transactions/import_anz.js
  // 1. Parse CSV with csv-parser
  // 2. Normalise dates and amounts
  // 3. Match entities via entity-matcher
  // 4. Deduplicate against existing SQLite records
  // 5. Write new transactions to SQLite (if --execute)

  console.log('[import-anz] Not yet implemented — migrate from import_anz.js');
}

main().catch((err: unknown) => {
  console.error('[import-anz] Fatal:', err);
  process.exit(1);
});
