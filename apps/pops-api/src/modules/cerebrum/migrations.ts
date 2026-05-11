/**
 * Migration tags owned by the `cerebrum` module.
 *
 * Covers engram_index, embeddings (including the sqlite-vec virtual table),
 * nudge_log, glia_actions, plexus_adapters, and the conversation
 * persistence tables (which ego shares but cerebrum owns the schema).
 *
 * See PRD-101 US-09 for the runtime filter contract.
 */
import { drizzleMigrations } from '../../db/load-drizzle-migration.js';

import type { MigrationDescriptor } from '@pops/types';

export const cerebrumMigrationTags: readonly string[] = [
  // engram_index — knowledge graph file metadata table.
  '0031_romantic_hannibal_king',
  // embeddings — dense vector storage.
  '0032_embeddings',
  // embeddings_vec — sqlite-vec virtual table for k-NN search.
  '0033_embeddings_vec',
  // engram_index: body_hash column for ingestion dedup.
  '0036_body_hash_engram_index',
  // conversations + messages + conversation_context (ego persistence;
  // cerebrum owns the schema — ego depends on cerebrum).
  '0038_sturdy_professor_monster',
  // nudge_log — reflex/nudge audit trail.
  '0039_dry_fabian_cortez',
  // glia_actions — glia workers audit trail.
  '0040_bumpy_namorita',
  // plexus_adapters — external data-source registry.
  '0041_plexus_adapters',
  // nudge_log safety re-creation (idempotent, see #2329).
  '0044_nudge_log',
  // engram_index body_hash safety re-application (#2329).
  '0046_engrams_body_hash',
  // glia_actions safety re-creation (idempotent).
  '0047_glia_actions',
  // conversations safety re-creation (idempotent).
  '0048_conversations',
];

export const cerebrumMigrations: readonly MigrationDescriptor[] =
  drizzleMigrations(cerebrumMigrationTags);
