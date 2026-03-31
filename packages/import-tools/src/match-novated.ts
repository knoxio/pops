/**
 * Match novated lease reimbursement pairs in the transactions table.
 * Links payroll deductions to the original lease charges.
 *
 * Usage: pnpm match:novated [--execute]
 */

async function main(): Promise<void> {
  const mode = process.argv.includes('--execute') ? 'execute' : 'dry-run';
  console.log(`[match-novated] Mode: ${mode}`);

  // TODO: Migrate from ~/Downloads/transactions/match_novated.js

  console.log('[match-novated] Not yet implemented — migrate from match_novated.js');
}

main().catch((err: unknown) => {
  console.error('[match-novated] Fatal:', err);
  process.exit(1);
});
