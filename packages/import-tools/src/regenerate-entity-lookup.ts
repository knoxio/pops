/**
 * Rebuild entity_lookup.json from the entities table.
 * Maps entity name -> entity ID for use by import scripts.
 *
 * Usage: pnpm entities:lookup
 */

async function main(): Promise<void> {
  console.log('[regenerate-entity-lookup] Starting...');

  // TODO: Migrate from ~/Downloads/transactions/regenerate_entity_lookup.js

  console.log('[regenerate-entity-lookup] Not yet implemented');
}

main().catch((err: unknown) => {
  console.error('[regenerate-entity-lookup] Fatal:', err);
  process.exit(1);
});
