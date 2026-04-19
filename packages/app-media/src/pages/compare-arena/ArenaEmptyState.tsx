import { Link } from 'react-router';

interface ArenaEmptyStateProps {
  watchlistedCount: number;
}

export function ArenaEmptyState({ watchlistedCount }: ArenaEmptyStateProps) {
  if (watchlistedCount > 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg mb-2">Not enough movies</p>
        <p className="text-sm">
          Some are on your watchlist.{' '}
          <Link to="/media/watchlist" className="text-primary underline">
            View watchlist
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-12 text-muted-foreground">
      <p className="text-lg mb-2">Not enough watched movies</p>
      <p className="text-sm">
        Watch at least 2 movies to start comparing.{' '}
        <Link to="/media" className="text-primary underline">
          Browse library
        </Link>
      </p>
    </div>
  );
}
