/**
 * ING CSV import script.
 * New for Phase 1 — covers ING Everyday and ING Loan accounts.
 *
 * Usage: pnpm import:ing --csv path/to/ing-export.csv [--execute]
 */

import type { RunMode } from './lib/types.js';

function parseArgs(): { csvPath: string; mode: RunMode } {
  const args = process.argv.slice(2);
  const csvIndex = args.indexOf('--csv');
  const csvPath = csvIndex >= 0 ? args[csvIndex + 1] : undefined;
  const mode: RunMode = args.includes('--execute') ? 'execute' : 'dry-run';

  if (!csvPath) {
    console.error('Usage: pnpm import:ing --csv <path> [--execute]');
    process.exit(1);
  }

  return { csvPath, mode };
}

async function main(): Promise<void> {
  const { csvPath, mode } = parseArgs();
  console.log(`[import-ing] CSV: ${csvPath}, Mode: ${mode}`);

  // TODO: Implement ING CSV import
  // 1. Parse ING CSV format
  // 2. Normalise dates and amounts
  // 3. Match entities via entity-matcher
  // 4. Deduplicate against existing SQLite records
  // 5. Write new transactions to SQLite (if --execute)

  console.log('[import-ing] Not yet implemented');
}

main().catch((err: unknown) => {
  console.error('[import-ing] Fatal:', err);
  process.exit(1);
});
