/**
 * Static migration ownership declarations (PRD-101 US-09, #2543).
 *
 * TRANSITIONAL (pillar-migration P1, ADR-026). This map drives the
 * install-set filter for migrations still living in the shared
 * `apps/pops-api/src/db/drizzle-migrations/` journal. It retires
 * incrementally as each pillar's Phase 1 split moves its tags into
 * `packages/<id>-db/migrations/_journal.json`; once a tag has moved, its
 * entry here is removed (the per-pillar runner doesn't need ownership
 * lookup — every entry in a pillar's own journal is owned by that pillar
 * by construction). The file is deleted in the final pillar's deletion PR
 * once the shared journal is empty. See
 * `.claude/pillar-migration-roadmap.md` for the schedule.
 *
 * Each module ALSO exposes its own list via `manifest.backend.migrations`,
 * but the migration runner needs the canonical owner map BEFORE the full
 * module graph is loaded — `db.ts` opens the database during process
 * bootstrap, and the manifest exports transitively import `db.ts` via their
 * tRPC routers. Pulling the live manifests into the runner would create
 * an import cycle that resolves to `undefined` at module load.
 *
 * The dual-source-of-truth here is intentional and tested: the registry
 * build / contract guard (US-11) verifies that every `manifest.backend.migrations`
 * entry has a matching row in this map and vice versa. This file is the
 * pre-load snapshot the runner consumes; the manifest exports stay as the
 * load-bearing declarations consumed by everything else.
 */

/** Tag → module id ownership map for every drizzle journal entry. */
export const MIGRATION_OWNERS: Readonly<Record<string, string>> = {
  // Pre-modular baseline — assigned to core (cross-domain content).
  '0000_naive_chameleon': 'core',
  '0001_many_marvel_zombies': 'media',
  '0002_magical_kid_colt': 'media',
  '0003_small_shotgun': 'media',
  '0004_tearful_mongu': 'media',
  '0009_red_quasimodo': 'core',
  '0010_gifted_firestar': 'core',
  '0011_natural_caretaker': 'media',
  '0012_exotic_smasher': 'media',
  '0013_worthless_speed': 'media',
  '0014_dapper_payback': 'media',
  '0015_condemned_anthem': 'media',
  '0016_certain_namor': 'media',
  '0017_loose_doomsday': 'media',
  // Theme-13 Wave-5 cascade — debrief_results + debrief_sessions originally
  // shipped under 0018; the cerebrum baseline (`0055_debrief_baseline.sql`)
  // now mirrors them on the cerebrum handle. Marked cerebrum-owned so the
  // shared journal entry retires when the table copies drop from pops.db.
  '0018_high_excalibur': 'cerebrum',
  '0019_little_diamondback': 'media',
  // Theme-13 Wave-5 cascade — debrief_status. Same reasoning as 0018.
  '0020_melodic_major_mapleleaf': 'cerebrum',
  '0022_elo_deltas': 'media',
  '0023_kind_james_howlett': 'media',
  '0024_dedupe_comparisons': 'media',
  '0028_needy_terror': 'media',
  '0029_curved_revanche': 'media',
  '0030_budgets_unique_category_period': 'core',
  '0031_romantic_hannibal_king': 'cerebrum',
  '0032_embeddings': 'cerebrum',
  '0033_embeddings_vec': 'cerebrum',
  '0034_ai_observability': 'core',
  '0035_ai_inference_log_drop_legacy_columns': 'core',
  '0036_body_hash_engram_index': 'cerebrum',
  '0038_sturdy_professor_monster': 'cerebrum',
  '0040_bumpy_namorita': 'cerebrum',
  '0041_plexus_adapters': 'cerebrum',
  '0042_strip_quoted_movie_titles': 'media',
  '0043_user_settings': 'core',
  '0045_ai_inference_log': 'core',
  '0046_engrams_body_hash': 'cerebrum',
  '0047_glia_actions': 'cerebrum',
  '0048_conversations': 'cerebrum',
  '0049_sonnet_4_6_model_pricing': 'core',
  '0050_ai_model_setting_alias': 'core',
  '0051_strip_quoted_tv_show_titles': 'media',
  '0053_ai_inference_daily': 'core',
  '0055_ai_alert_rules': 'core',
  '0056_ai_observability_repair': 'core',
  // PRD-106 — food slug_registry + ingredients + variants + prep_states + aliases.
  '0058_high_sentinel': 'food',
  // PRD-107 — food recipes + recipe_versions + recipe_tags.
  '0059_useful_hiroim': 'food',
  // PRD-108 — food batches + recipe_runs + batch_consumptions + variant shelf-life columns.
  '0060_familiar_leo': 'food',
  // PRD-109 — food substitutions.
  '0061_shocking_skreet': 'food',
  // PRD-112 — lists + list_items (generic lists package; food is first consumer).
  '0062_chemical_donald_blake': 'lists',
  // PRD-111 — food plan_slots + plan_entries.
  '0063_bumpy_wolverine': 'food',
  // PRD-110 — food ingest_sources.
  '0064_peaceful_magma': 'food',
  // PRD-116 — recipe_lines + recipe_steps + recipe_version_proposed_slugs.
  '0065_prd_116_recipe_compile': 'food',
  // PRD-123 — unit_conversions + ingredient_weights.
  '0066_prd_123_conversions': 'food',
  // PRD-125 amendment to PRD-110 — error_code/error_message/attempts columns
  // on ingest_sources for failure-band persistence across BullMQ TTL.
  '0067_prd_125_ingest_error_columns': 'food',
  // PRD-136 — recipe_version_rejections + ingest_sources.reviewed_at for the
  // inbox approve/reject flow.
  '0068_prd_136_inbox_review': 'food',
  // PRD-145 — batches.deleted_at soft-delete column (service-enforced invariant
  // deleted_at IS NOT NULL → qty_remaining = 0).
  '0069_prd_145_batches_deleted_at': 'food',
  // PRD-151 — ingredient_tags many-to-many table + NOCASE + namespace
  // expression index. Powers PRD-122's tag editor + PRD-152's plan-derived
  // shopping list generator.
  '0070_prd_151_ingredient_tags': 'food',
  // Theme 13 / PR #3111 Option D step 1 — denormalise media_type + media_id
  // onto debrief_sessions so the cross-pillar getDebriefByMedia read no
  // longer needs the watch_history join. Owned by cerebrum even though the
  // table still physically lives on `pops.db` until the follow-up cerebrum
  // baseline migration picks it up.
  '0071_debrief_media_denorm': 'cerebrum',
};

/** Materialised as a Map for O(1) lookup by the runner. */
export const migrationOwners: ReadonlyMap<string, string> = new Map(
  Object.entries(MIGRATION_OWNERS)
);

/**
 * Set of module ids that own at least one migration. Boot-time helper
 * used by the runner to seed the install-set view before any module
 * manifest is loaded.
 */
export const KNOWN_OWNER_IDS: ReadonlySet<string> = new Set(Object.values(MIGRATION_OWNERS));
