import { Link } from 'react-router';

import type { WatchlistFilter } from './types';

export function WatchlistEmptyState({ filter }: { filter: WatchlistFilter }) {
  const message =
    filter === 'all'
      ? 'Your watchlist is empty. Browse your library or search for something to watch.'
      : filter === 'movie'
        ? 'No movies on your watchlist.'
        : 'No TV shows on your watchlist.';

  return (
    <div className="text-center py-16">
      <p className="text-muted-foreground">{message}</p>
      <div className="flex justify-center gap-4 mt-4">
        <Link to="/media" className="text-sm text-primary underline">
          Browse library
        </Link>
        <Link to="/media/search" className="text-sm text-primary underline">
          Search
        </Link>
      </div>
    </div>
  );
}
