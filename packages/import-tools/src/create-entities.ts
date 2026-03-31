/**
 * Batch create entities in the entities table.
 * Also regenerates entity_lookup.json after creation.
 *
 * Usage: pnpm entities:create [--execute]
 */

async function main(): Promise<void> {
  const mode = process.argv.includes('--execute') ? 'execute' : 'dry-run';
  console.log(`[create-entities] Mode: ${mode}`);

  // TODO: Migrate from ~/Downloads/transactions/create_entities.js

  console.log('[create-entities] Not yet implemented — migrate from create_entities.js');
}

main().catch((err: unknown) => {
  console.error('[create-entities] Fatal:', err);
  process.exit(1);
});
