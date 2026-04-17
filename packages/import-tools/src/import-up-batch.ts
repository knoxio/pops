/**
 * Up Bank API batch import script.
 * Fetches transactions from Up Bank API and normalises to ParsedTransaction format.
 *
 * Usage: pnpm import:up [--since 2026-01-01] [--execute]
 */

import { fetchUpAccounts, fetchUpTransactions, getUpApiToken } from './lib/up-client.js';
import { transformUpTransaction } from './lib/up-transformer.js';

import type { RunMode } from './lib/types.js';
import type { ParsedTransaction } from './lib/types.js';

function parseArgs(): { since?: string; mode: RunMode } {
  const args = process.argv.slice(2);
  const sinceIndex = args.indexOf('--since');
  const since = sinceIndex >= 0 ? args[sinceIndex + 1] : undefined;
  const mode: RunMode = args.includes('--execute') ? 'execute' : 'dry-run';

  return { since, mode };
}

/**
 * Log a preview table of parsed transactions (first N rows).
 */
function logPreview(transactions: ParsedTransaction[], limit = 5): void {
  const preview = transactions.slice(0, limit);
  console.log('\n--- Preview (first %d of %d) ---', preview.length, transactions.length);
  for (const tx of preview) {
    console.log(
      '  %s | %s | %s | %s',
      tx.date,
      String(tx.amount).padStart(10),
      tx.account.padEnd(20),
      tx.description
    );
  }
  console.log('---\n');
}

async function main(): Promise<void> {
  const { since, mode } = parseArgs();
  console.log(`[import-up] Since: ${since ?? 'all'}, Mode: ${mode}`);

  // 1. Resolve API token
  const token = getUpApiToken();

  // 2. Fetch accounts → build id→name map
  console.log('[import-up] Fetching accounts...');
  const accountMap = await fetchUpAccounts(token);
  console.log(
    `[import-up] Found ${accountMap.size} account(s):`,
    [...accountMap.values()].join(', ')
  );

  // 3. Fetch transactions (with optional since filter)
  console.log('[import-up] Fetching transactions...');
  const rawTransactions = await fetchUpTransactions(token, since);
  console.log(`[import-up] Fetched ${rawTransactions.length} transaction(s) from API`);

  // 4. Map each transaction to ParsedTransaction
  const parsed: ParsedTransaction[] = rawTransactions.map((tx) => {
    const accountName = accountMap.get(tx.accountId) ?? 'Up (Unknown Account)';
    return transformUpTransaction(tx, accountName);
  });

  // 5. Output
  if (mode === 'dry-run') {
    console.log(`[import-up] Dry-run complete — ${parsed.length} transaction(s) parsed`);
    if (parsed.length > 0) {
      logPreview(parsed);
    }
  } else {
    // --execute: database write is future work; show what would be imported
    console.log(
      `[import-up] Execute mode — execution not yet wired to database. ${parsed.length} transaction(s) ready.`
    );
    if (parsed.length > 0) {
      logPreview(parsed);
    }
  }
}

main().catch((err: unknown) => {
  console.error('[import-up] Fatal:', err);
  process.exit(1);
});
