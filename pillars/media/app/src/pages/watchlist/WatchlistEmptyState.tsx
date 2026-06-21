import { Link } from 'react-router';

import type { WatchlistFilter } from './types';

export function WatchlistEmptyState({ filter }: { filter: WatchlistFilter }) {
  let message: string;
  if (filter === 'all') {
    message = 'Your watchlist is empty. Browse your library or search for something to watch.';
  } else if (filter === 'movie') {
    message = 'No movies on your watchlist.';
  } else {
    message = 'No TV shows on your watchlist.';
  }

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
