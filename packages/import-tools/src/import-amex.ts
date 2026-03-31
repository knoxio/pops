/**
 * Amex CSV import script.
 * Handles Amex's multiline field format and Town/City, Country extraction.
 *
 * Usage: pnpm import:amex --csv path/to/activity.csv [--execute]
 */

import type { RunMode } from './lib/types.js';

function parseArgs(): { csvPath: string; mode: RunMode } {
  const args = process.argv.slice(2);
  const csvIndex = args.indexOf('--csv');
  const csvPath = csvIndex >= 0 ? args[csvIndex + 1] : undefined;
  const mode: RunMode = args.includes('--execute') ? 'execute' : 'dry-run';

  if (!csvPath) {
    console.error('Usage: pnpm import:amex --csv <path> [--execute]');
    process.exit(1);
  }

  return { csvPath, mode };
}

async function main(): Promise<void> {
  const { csvPath, mode } = parseArgs();
  console.log(`[import-amex] CSV: ${csvPath}, Mode: ${mode}`);

  // TODO: Migrate implementation from ~/Downloads/transactions/import_amex.js
  // 1. Parse Amex CSV (handles multiline fields, Town/City extraction)
  // 2. Normalise dates and amounts
  // 3. Match entities via entity-matcher
  // 4. Deduplicate against existing SQLite records
  // 5. Write new transactions to SQLite (if --execute)

  console.log('[import-amex] Not yet implemented — migrate from import_amex.js');
}

main().catch((err: unknown) => {
  console.error('[import-amex] Fatal:', err);
  process.exit(1);
});
