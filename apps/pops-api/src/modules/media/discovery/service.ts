/**
 * Discovery service — preference profile, library queries, scoring,
 * dismissal, and rewatch suggestions.
 *
 * The implementation is split into focused modules under `service-*.ts`.
 *
 * Dismiss-pile cutover (PRD-170 PR 3): `dismiss`, `undismiss`, and
 * `getDismissed` now forward to `@pops/media-db`'s
 * `dismissedDiscoverService`, resolving the media pillar's per-pillar
 * SQLite handle via `getMediaDrizzle()`. Reads of the same table in
 * `./flags.ts::getDismissedTmdbIds` flip in the same PR so the writer
 * never races a stale read off `pops.db`. The boot-time
 * `backfillMediaFromShared()` bridge carries existing rows across on
 * first deploy; PRD-170 PR 4 drops `dismissed_discover` from the shared
 * journal and retires the bridge entry.
 */
import { dismissedDiscoverService } from '@pops/media-db';

import { getMediaDrizzle } from '../../../db/media-db-handle.js';

export { getPreferenceProfile } from './service-preference-profile.js';
export { getQuickPickMovies, getUnwatchedLibraryMovies } from './service-library.js';
export { scoreDiscoverResults } from './service-scoring.js';
export { getRewatchSuggestions } from './service-rewatch.js';

/** Dismiss a movie by tmdbId (idempotent — ON CONFLICT DO NOTHING). */
export function dismiss(tmdbId: number): void {
  dismissedDiscoverService.dismiss(getMediaDrizzle(), tmdbId);
}

/** Undismiss a movie by tmdbId. */
export function undismiss(tmdbId: number): void {
  dismissedDiscoverService.undismiss(getMediaDrizzle(), tmdbId);
}

/** Get all dismissed tmdbIds. */
export function getDismissed(): number[] {
  return dismissedDiscoverService.listDismissedTmdbIds(getMediaDrizzle());
}
