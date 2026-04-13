import { Button, Skeleton } from '@pops/ui';
import { RefreshCw, Sparkles } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';

import { MediaCard } from '../components/MediaCard';
import { trpc } from '../lib/trpc';

const COUNT_OPTIONS = [2, 3, 4, 5] as const;
const DEFAULT_COUNT = 3;

function parseCount(raw: string | null): number {
  const n = Number(raw);
  if (COUNT_OPTIONS.includes(n as (typeof COUNT_OPTIONS)[number])) return n;
  return DEFAULT_COUNT;
}

export function QuickPickPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const count = parseCount(searchParams.get('count'));

  const { data, isLoading, refetch } = trpc.media.library.quickPick.useQuery(
    { count },
    { refetchOnWindowFocus: false }
  );

  const picks = data?.data ?? [];

  function setCount(n: number) {
    setSearchParams({ count: String(n) }, { replace: true });
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-app-accent animate-pulse" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: count }, (_, i) => (
            <Skeleton key={i} className="aspect-[2/3] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (picks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <Sparkles className="h-10 w-10 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Nothing unwatched in your library</h2>
        <p className="text-muted-foreground text-sm max-w-xs">
          Add more movies to your library or mark some as unwatched to get picks.
        </p>
        <Button onClick={() => navigate('/media/search')}>Search for movies</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-app-accent" />
          Quick Pick
        </h1>
        <div className="flex items-center gap-3">
          {/* Count selector */}
          <div
            className="flex items-center gap-1 rounded-lg border p-1"
            role="group"
            aria-label="Number of picks"
          >
            {COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  n === count
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                aria-pressed={n === count}
              >
                {n}
              </button>
            ))}
          </div>
          {/* Show me others */}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Show me others
          </Button>
        </div>
      </div>

      {/* Poster grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {picks.map((movie) => (
          <div key={movie.id} className="space-y-2">
            <MediaCard
              id={movie.id}
              type="movie"
              title={movie.title}
              year={movie.releaseDate}
              posterUrl={movie.posterUrl}
              showTypeBadge={false}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full font-medium"
              onClick={() => navigate(`/media/movies/${movie.id}`)}
            >
              Watch This
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
