/**
 * Migration tags owned by the `cerebrum` module.
 *
 * Covers engram_index, embeddings (including the sqlite-vec virtual table),
 * glia_actions, plexus_adapters, and the conversation persistence tables
 * (which ego shares but cerebrum owns the schema). The `nudge_log` tags
 * `0039_dry_fabian_cortez` and `0044_nudge_log` were retired from the
 * shared drizzle journal under Track L5 once cerebrum-db's own journal
 * became authoritative; nudge_log persistence runs there now.
 *
 * See PRD-101 US-09 for the runtime filter contract.
 */
import { drizzleMigrations } from '../../db/load-drizzle-migration.js';

import type { MigrationDescriptor } from '@pops/types';

export const cerebrumMigrationTags: readonly string[] = [
  // debrief_results + debrief_sessions — Theme-13 Wave-5 cascade ownership
  // flip. The shared journal entry remains while the table copies stay on
  // pops.db; the cerebrum baseline `0055_debrief_baseline.sql` mirrors the
  // shape and the boot-time backfill bridges existing rows across.
  '0018_high_excalibur',
  // debrief_status — same Theme-13 Wave-5 cascade flip as 0018.
  '0020_melodic_major_mapleleaf',
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
  // glia_actions — glia workers audit trail.
  '0040_bumpy_namorita',
  // plexus_adapters — external data-source registry.
  '0041_plexus_adapters',
  // engram_index body_hash safety re-application (#2329).
  '0046_engrams_body_hash',
  // glia_actions safety re-creation (idempotent).
  '0047_glia_actions',
  // conversations safety re-creation (idempotent).
  '0048_conversations',
  // Theme 13 / PR #3111 Option D step 1 — denormalise media_type + media_id
  // onto debrief_sessions so the cross-pillar getDebriefByMedia read
  // (logWatchCompletion / getDebrief) no longer needs the watch_history join.
  '0071_debrief_media_denorm',
];

export const cerebrumMigrations: readonly MigrationDescriptor[] =
  drizzleMigrations(cerebrumMigrationTags);
