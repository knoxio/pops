/**
 * Static migration ownership declarations (PRD-101 US-09, #2543).
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
  '0005_fancy_crystal': 'inventory',
  '0006_motionless_speed_demon': 'inventory',
  '0007_broad_arclight': 'inventory',
  '0008_tough_nick_fury': 'inventory',
  '0009_red_quasimodo': 'core',
  '0010_gifted_firestar': 'core',
  '0011_natural_caretaker': 'media',
  '0012_exotic_smasher': 'media',
  '0013_worthless_speed': 'media',
  '0014_dapper_payback': 'media',
  '0015_condemned_anthem': 'media',
  '0016_certain_namor': 'media',
  '0017_loose_doomsday': 'media',
  '0018_high_excalibur': 'media',
  '0019_little_diamondback': 'media',
  '0020_melodic_major_mapleleaf': 'media',
  '0021_spooky_lockheed': 'media',
  '0022_elo_deltas': 'media',
  '0023_kind_james_howlett': 'media',
  '0024_dedupe_comparisons': 'media',
  '0025_youthful_hulk': 'finance',
  '0026_little_frank_castle': 'finance',
  '0027_slow_dormammu': 'finance',
  '0028_needy_terror': 'media',
  '0029_curved_revanche': 'media',
  '0030_budgets_unique_category_period': 'core',
  '0031_romantic_hannibal_king': 'cerebrum',
  '0032_embeddings': 'cerebrum',
  '0033_embeddings_vec': 'cerebrum',
  '0034_ai_observability': 'core',
  '0035_ai_inference_log_drop_legacy_columns': 'core',
  '0036_body_hash_engram_index': 'cerebrum',
  '0037_item_uploaded_files': 'inventory',
  '0038_sturdy_professor_monster': 'cerebrum',
  '0039_dry_fabian_cortez': 'cerebrum',
  '0040_bumpy_namorita': 'cerebrum',
  '0041_plexus_adapters': 'cerebrum',
  '0042_strip_quoted_movie_titles': 'media',
  '0043_user_settings': 'core',
  '0044_nudge_log': 'cerebrum',
  '0045_ai_inference_log': 'core',
  '0046_engrams_body_hash': 'cerebrum',
  '0047_glia_actions': 'cerebrum',
  '0048_conversations': 'cerebrum',
  '0049_sonnet_4_6_model_pricing': 'core',
  '0050_ai_model_setting_alias': 'core',
  '0051_strip_quoted_tv_show_titles': 'media',
  '0052_budgets_active_default_zero': 'finance',
  '0053_ai_inference_daily': 'core',
  '0054_service_accounts': 'core',
  '0055_ai_alert_rules': 'core',
  '0056_ai_observability_repair': 'core',
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
