/**
 * `plex_settings` key constants.
 *
 * Literal values match the monolith's `core/settings` keys so data backfilled
 * from the shared store lands under the same names.
 */
export const PLEX_KEYS = {
  url: 'plex_url',
  token: 'plex_token',
  username: 'plex_username',
  encryptionSeed: 'plex_encryption_seed',
  clientIdentifier: 'plex_client_identifier',
  movieSectionId: 'plex_movie_section_id',
  tvSectionId: 'plex_tv_section_id',
  schedulerEnabled: 'plex_scheduler_enabled',
  schedulerIntervalMs: 'plex_scheduler_interval_ms',
} as const;
