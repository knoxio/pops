/**
 * Local re-export of the media domain tables.
 *
 * Canonical definitions live in `@pops/db-types/src/schema/*.ts` so the
 * drizzle-kit config (which globs `packages/db-types/src/schema/*`) picks
 * them up and the rest of the platform sees a single schema barrel.
 *
 * Services in this package import from here for ergonomics and so that
 * the media module's read surface stays self-describing.
 *
 * Mirrors the `@pops/core-db` schema re-export pattern. The shape grows as
 * subsequent Phase 1 PRs migrate additional media tables into this package.
 */
export {
  dismissedDiscover,
  episodes,
  mediaWatchlist,
  movies,
  seasons,
  shelfImpressions,
  tvShows,
  watchHistory,
} from '@pops/db-types';
