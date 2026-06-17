/**
 * Nine local-library shelves — comfort picks, undiscovered, recently-added,
 * short watches, long epics, friend-proof, polarizing, franchise completions,
 * and the pinned leaving-soon rotation shelf.
 *
 * Each delegates to a `discoveryService` db query; no TMDB calls. Built via a
 * small factory so the per-shelf boilerplate stays minimal.
 *
 * Ported from the monolith `shelf/local-*.ts` family.
 */
import { type MediaDb, discoveryService } from '../../../../db/index.js';

import type { DiscoverResult } from '../../../../db/index.js';
import type { ShelfDefinition, ShelfGenerateArgs, ShelfInstance, ShelfQueryOpts } from './types.js';

type LocalQuery = (db: MediaDb, limit: number, offset: number) => DiscoverResult[];

interface LocalShelfSpec {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  score: number;
  query: LocalQuery;
}

function localShelf(spec: LocalShelfSpec): ShelfDefinition {
  return {
    id: spec.id,
    template: false,
    category: 'local',
    generate({ deps }: ShelfGenerateArgs): ShelfInstance[] {
      return [
        {
          shelfId: spec.id,
          title: spec.title,
          subtitle: spec.subtitle,
          emoji: spec.emoji,
          score: spec.score,
          query: (opts: ShelfQueryOpts) =>
            Promise.resolve(spec.query(deps.db, opts.limit, opts.offset)),
        },
      ];
    },
  };
}

export const comfortPicksShelf = localShelf({
  id: 'comfort-picks',
  title: 'Comfort Picks',
  subtitle: 'Your most-rewatched movies',
  emoji: '🛋️',
  score: 0.7,
  query: discoveryService.getComfortPicks,
});

export const undiscoveredShelf = localShelf({
  id: 'undiscovered',
  title: 'Undiscovered',
  subtitle: "Library movies you've never touched",
  emoji: '🔍',
  score: 0.65,
  query: discoveryService.getUndiscoveredMovies,
});

export const recentlyAddedShelf = localShelf({
  id: 'recently-added',
  title: 'Recently Added',
  subtitle: 'New to your library',
  emoji: '✨',
  score: 0.8,
  query: discoveryService.getRecentlyAddedMovies,
});

export const shortWatchShelf = localShelf({
  id: 'short-watch',
  title: 'Short Watches',
  subtitle: 'Under 100 minutes, no commitment',
  emoji: '⚡',
  score: 0.6,
  query: discoveryService.getShortWatches,
});

export const longEpicShelf = localShelf({
  id: 'long-epic',
  title: 'Epic Watches',
  subtitle: '150+ minutes — set aside an evening',
  emoji: '🎞️',
  score: 0.55,
  query: discoveryService.getLongEpics,
});

export const friendProofShelf = localShelf({
  id: 'friend-proof',
  title: 'Friend-Proof',
  subtitle: 'High entertainment value for any crowd',
  emoji: '🍿',
  score: 0.75,
  query: discoveryService.getFriendProofMovies,
});

export const polarizingShelf = localShelf({
  id: 'polarizing',
  title: 'Polarizing Picks',
  subtitle: 'Movies that split opinion across dimensions',
  emoji: '⚡',
  score: 0.5,
  query: discoveryService.getPolarizingMovies,
});

export const franchiseCompletionsShelf = localShelf({
  id: 'franchise-completions',
  title: 'Complete the Series',
  subtitle: "More movies in genres you've watched",
  emoji: '🔗',
  score: 0.6,
  query: discoveryService.getFranchiseCompletions,
});

/**
 * Leaving-soon is pinned: it bypasses the minimum-items threshold so even a
 * single expiring movie surfaces. It only generates when something is leaving.
 */
export const leavingSoonShelf: ShelfDefinition = {
  id: 'leaving-soon',
  template: false,
  category: 'local',
  pinned: true,
  generate({ deps }: ShelfGenerateArgs): ShelfInstance[] {
    if (!discoveryService.hasLeavingMovies(deps.db)) return [];
    return [
      {
        shelfId: 'leaving-soon',
        title: 'Leaving Soon',
        subtitle: 'Watch before they go',
        emoji: '⏳',
        score: 0.95,
        query: (opts) =>
          Promise.resolve(discoveryService.getLeavingSoonMovies(deps.db, opts.limit, opts.offset)),
      },
    ];
  },
};
