/**
 * Up Bank API batch import script.
 * Fetches transactions from Up Bank API and imports to SQLite.
 *
 * Usage: pnpm import:up [--since 2026-01-01] [--execute]
 */

import type { RunMode } from './lib/types.js';

function parseArgs(): { since?: string; mode: RunMode } {
  const args = process.argv.slice(2);
  const sinceIndex = args.indexOf('--since');
  const since = sinceIndex >= 0 ? args[sinceIndex + 1] : undefined;
  const mode: RunMode = args.includes('--execute') ? 'execute' : 'dry-run';

  return { since, mode };
}

async function main(): Promise<void> {
  const { since, mode } = parseArgs();
  console.log(`[import-up] Since: ${since ?? 'all'}, Mode: ${mode}`);

  // TODO: Migrate from ~/Downloads/transactions/extract_personal_accounts.js
  // 1. Fetch transactions from Up Bank API (with optional --since filter)
  // 2. Normalise to ParsedTransaction format
  // 3. Match entities via entity-matcher
  // 4. Deduplicate against existing SQLite records
  // 5. Write new transactions to SQLite (if --execute)

  console.log('[import-up] Not yet implemented — migrate from extract_personal_accounts.js');
}

main().catch((err: unknown) => {
  console.error('[import-up] Fatal:', err);
  process.exit(1);
});
