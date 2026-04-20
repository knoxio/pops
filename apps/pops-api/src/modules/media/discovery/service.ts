/**
 * Discovery service — preference profile, library queries, scoring,
 * dismissal, and rewatch suggestions.
 *
 * The implementation is split into focused modules under `service-*.ts`.
 */
import { eq } from 'drizzle-orm';

import { dismissedDiscover } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';

export { getPreferenceProfile } from './service-preference-profile.js';
export { getQuickPickMovies, getUnwatchedLibraryMovies } from './service-library.js';
export { scoreDiscoverResults } from './service-scoring.js';
export { getRewatchSuggestions } from './service-rewatch.js';

/** Dismiss a movie by tmdbId (idempotent — ON CONFLICT DO NOTHING). */
export function dismiss(tmdbId: number): void {
  const db = getDrizzle();
  db.insert(dismissedDiscover).values({ tmdbId }).onConflictDoNothing().run();
}

/** Undismiss a movie by tmdbId. */
export function undismiss(tmdbId: number): void {
  const db = getDrizzle();
  db.delete(dismissedDiscover).where(eq(dismissedDiscover.tmdbId, tmdbId)).run();
}

/** Get all dismissed tmdbIds. */
export function getDismissed(): number[] {
  const db = getDrizzle();
  const rows = db.select({ tmdbId: dismissedDiscover.tmdbId }).from(dismissedDiscover).all();
  return rows.map((r) => r.tmdbId);
}
