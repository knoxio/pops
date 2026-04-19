import { LayoutGrid, RefreshCw } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle, cn } from '@pops/ui';

import { type Tier, TierListBoard, type TierMovie } from '../../components/TierListBoard';
import { PoolSkeleton } from './PoolSkeleton';

interface TierBoardSectionProps {
  movies: TierMovie[];
  moviesLoading: boolean;
  moviesError: { message: string } | null;
  isPending: boolean;
  isFetching: boolean;
  refetch: () => void;
  handleSubmit: (placements: Array<{ movieId: number; tier: Tier }>) => void;
  handleNotWatched: (movieId: number) => void;
  handleMarkStale: (movieId: number) => void;
  handleNA: (movieId: number) => void;
}

function EmptyMovies() {
  return (
    <div className="text-center py-16">
      <LayoutGrid className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
      <p className="text-muted-foreground">
        No eligible movies for this dimension. Compare more movies or check your exclusions.
      </p>
    </div>
  );
}

function RefreshButton({ isFetching, refetch }: { isFetching: boolean; refetch: () => void }) {
  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={() => refetch()}
        disabled={isFetching}
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
        aria-label="Refresh movie pool"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
        Refresh
      </button>
    </div>
  );
}

export function TierBoardSection(props: TierBoardSectionProps) {
  const { movies, moviesLoading, moviesError, isFetching, refetch } = props;

  function renderBody() {
    if (moviesError) {
      return (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to load movies for tier list.</AlertDescription>
        </Alert>
      );
    }
    if (moviesLoading) return <PoolSkeleton />;
    if (movies.length === 0) return <EmptyMovies />;
    return (
      <TierListBoard
        movies={movies}
        onSubmit={props.handleSubmit}
        submitPending={props.isPending}
        onNotWatched={props.handleNotWatched}
        onMarkStale={props.handleMarkStale}
        onNA={props.handleNA}
      />
    );
  }

  return (
    <div className="space-y-3">
      <RefreshButton isFetching={isFetching} refetch={refetch} />
      {renderBody()}
    </div>
  );
}
