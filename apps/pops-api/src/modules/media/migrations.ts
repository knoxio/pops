/**
 * Migration tags owned by the `media` module.
 *
 * Covers the movies/tv_shows/comparisons/watchlist/watch_history/library
 * surface and the rotation/debrief subsystems.
 *
 * See PRD-101 US-09 for the runtime filter contract.
 */
import { drizzleMigrations } from '../../db/load-drizzle-migration.js';

import type { MigrationDescriptor } from '@pops/types';

export const mediaMigrationTags: readonly string[] = [
  // movies + comparisons + media_scores + watch_history + tv_shows seasons.
  '0001_many_marvel_zombies',
  // episodes — Plex-derived episode table.
  '0002_magical_kid_colt',
  // episodes — second baseline iteration (drizzle generated alongside).
  '0003_small_shotgun',
  // watchlist + watchlist_movies.
  '0004_tearful_mongu',
  // dismissed_discover.
  '0011_natural_caretaker',
  // movies/tv_shows discover_rating_key.
  '0012_exotic_smasher',
  // comparisons draw_tier.
  '0013_worthless_speed',
  // watch_history blacklisted column.
  '0014_dapper_payback',
  // media_scores excluded column.
  '0015_condemned_anthem',
  // comparison_skip_cooloffs.
  '0016_certain_namor',
  // comparison_staleness.
  '0017_loose_doomsday',
  // debrief_results / debrief_sessions.
  '0018_high_excalibur',
  // tier_overrides.
  '0019_little_diamondback',
  // debrief_status.
  '0020_melodic_major_mapleleaf',
  // shelf_impressions.
  '0021_spooky_lockheed',
  // comparisons elo deltas.
  '0022_elo_deltas',
  // comparisons source column.
  '0023_kind_james_howlett',
  // dedupe_comparisons one-off cleanup.
  '0024_dedupe_comparisons',
  // rotation_log + movies rotation columns.
  '0028_needy_terror',
  // rotation_* tables (candidates, exclusions, sources).
  '0029_curved_revanche',
  // strip-quoted movie titles cleanup (#2402).
  '0042_strip_quoted_movie_titles',
  // strip-quoted tv_shows names cleanup (#2403).
  '0051_strip_quoted_tv_show_titles',
];

export const mediaMigrations: readonly MigrationDescriptor[] =
  drizzleMigrations(mediaMigrationTags);
