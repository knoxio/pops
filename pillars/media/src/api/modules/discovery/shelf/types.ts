/**
 * Shelf-based discovery system — core interfaces.
 *
 * A {@link ShelfDefinition} is a blueprint that generates one or more
 * {@link ShelfInstance}s for a user. Template shelves emit one instance per
 * seed (e.g. one "Because you watched X" per recent watch); static shelves emit
 * a single instance.
 *
 * Unlike the monolith (where each shelf closed over module-level
 * `getMediaDrizzle()` / `getTmdbClient()` singletons), `generate` and the
 * instance `query` take the injected {@link DiscoveryDeps} so the pillar's
 * orchestration stays unit-testable.
 *
 * Ported from the monolith `discovery/shelf/types.ts`.
 */
import type { DiscoverResult, PreferenceProfile } from '../../../../db/index.js';
import type { DiscoveryDeps } from '../deps.js';

export type ShelfCategory = 'seed' | 'profile' | 'tmdb' | 'local' | 'context' | 'external';

export interface ShelfQueryOpts {
  limit: number;
  offset: number;
}

export interface ShelfInstance {
  /** Unique key for this instance, e.g. "because-you-watched:42" or "hidden-gems". */
  shelfId: string;
  title: string;
  subtitle?: string;
  emoji?: string;
  /** Fetch movies for this shelf. Idempotent — same options → same results. */
  query(opts: ShelfQueryOpts): Promise<DiscoverResult[]>;
  /** Relevance score (0–1). Higher = more likely to be selected. */
  score: number;
  /** For seed-based shelves — the movie id that seeded this instance. */
  seedMovieId?: number;
  /** Pinned instances bypass the minimum-items threshold during selection. */
  pinned?: boolean;
}

export interface ShelfGenerateArgs {
  deps: DiscoveryDeps;
  profile: PreferenceProfile;
}

export interface ShelfDefinition {
  /** Unique shelf type id, e.g. "because-you-watched", "hidden-gems". */
  id: string;
  /** true = `generate` returns multiple instances (one per seed); false = one. */
  template: boolean;
  category: ShelfCategory;
  /**
   * When true, all instances are always prepended to the session (before
   * random selection) whenever they produce results, bypassing variety caps.
   */
  pinned?: boolean;
  /** Generate instances for the given deps + profile. */
  generate(args: ShelfGenerateArgs): ShelfInstance[];
}
