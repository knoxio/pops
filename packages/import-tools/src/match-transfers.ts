/**
 * Match inter-account transfer pairs in the transactions table.
 * Links matching debit/credit transactions across accounts via related_transaction_id.
 *
 * Usage: pnpm match:transfers [--execute]
 */

async function main(): Promise<void> {
  const mode = process.argv.includes('--execute') ? 'execute' : 'dry-run';
  console.log(`[match-transfers] Mode: ${mode}`);

  // TODO: Migrate from ~/Downloads/transactions/match_transfers.js
  // 1. Query SQLite for unlinked transactions
  // 2. Find matching pairs (same date, opposite amounts, different accounts)
  // 3. Link via Related Transaction relation (if --execute)

  console.log('[match-transfers] Not yet implemented — migrate from match_transfers.js');
}

main().catch((err: unknown) => {
  console.error('[match-transfers] Fatal:', err);
  process.exit(1);
});
