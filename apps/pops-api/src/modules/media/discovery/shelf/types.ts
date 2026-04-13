/**
 * Shelf-based discovery system — core interfaces and types.
 *
 * A ShelfDefinition is a blueprint that can generate one or more ShelfInstances.
 * Template shelves (template: true) generate one instance per seed (e.g. one
 * "Because you watched X" shelf per recent watch). Static shelves produce a
 * single instance (e.g. "Trending").
 */
import type { DiscoverResult, PreferenceProfile } from '../types.js';

export type { PreferenceProfile };

export type ShelfCategory =
  | 'seed' // seeded by a specific movie, director, actor, or dimension
  | 'profile' // driven by user preference profile (genre affinities, ELO weights)
  | 'tmdb' // pure TMDB discovery queries (trending, new releases, hidden gems, etc.)
  | 'local' // local library queries only (no TMDB)
  | 'context' // time/season/occasion triggered
  | 'external'; // external sources (Plex Discover, etc.)

export interface ShelfInstance {
  /** Unique key for this instance, e.g. "because-you-watched:42" or "hidden-gems". */
  shelfId: string;
  /** Display title, e.g. "Because you watched Interstellar". */
  title: string;
  /** Optional subtitle, e.g. "Movies similar to your recent watch". */
  subtitle?: string;
  /** Optional emoji for theming, e.g. "🎬". */
  emoji?: string;
  /**
   * Fetches movies for this shelf.
   * Must be idempotent — same options → same (or equivalent) results.
   */
  query(options: { limit: number; offset: number }): Promise<DiscoverResult[]>;
  /** Relevance score for this instance (0–1). Higher = more likely to be selected. */
  score: number;
  /** For seed-based shelves — the movie ID that seeded this instance. */
  seedMovieId?: number;
}

export interface ShelfDefinition {
  /** Unique shelf type ID, e.g. "because-you-watched", "hidden-gems". */
  id: string;
  /**
   * Whether this definition is parametrized.
   * true = generate() returns multiple instances (one per seed).
   * false = generate() returns a single instance.
   */
  template: boolean;
  /** Category for variety-constraint enforcement during session assembly. */
  category: ShelfCategory;
  /**
   * Generates shelf instances for the given user preference profile.
   * Template shelves return one instance per seed; static shelves return one.
   */
  generate(profile: PreferenceProfile): ShelfInstance[];
}
