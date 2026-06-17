import { ButtonPrimitive } from '@pops/ui';

import { BlacklistConfirmDialog } from '../components/BlacklistConfirmDialog';
import { ComparisonMovieCardSkeleton } from '../components/ComparisonMovieCard';
import { ArenaDimensionPicker } from './compare-arena/ArenaDimensionPicker';
import { ArenaEmptyState } from './compare-arena/ArenaEmptyState';
import { ArenaHeader } from './compare-arena/ArenaHeader';
import { ArenaPair } from './compare-arena/ArenaPair';
import { ArenaPrompt } from './compare-arena/ArenaPrompt';
import { useCompareArenaPageModel } from './compare-arena/useCompareArenaPageModel';

import type { PairData } from './compare-arena/types';
import type { useArenaActions } from './compare-arena/useArenaActions';

function ArenaError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <p className="text-lg mb-2">Something went wrong</p>
      <p className="text-sm">{message}</p>
      <ButtonPrimitive variant="link" size="sm" onClick={onRetry} className="mt-2">
        Try again
      </ButtonPrimitive>
    </div>
  );
}

function ArenaSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-8">
      <ComparisonMovieCardSkeleton />
      <ComparisonMovieCardSkeleton />
    </div>
  );
}

export function CompareArenaPage() {
  const m = useCompareArenaPageModel();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <ArenaHeader sessionCount={m.actions.sessionCount} />
      <ArenaDimensionPicker
        loading={m.dimsLoading}
        activeDimensions={m.activeDimensions}
        dimensionId={m.dimensionId}
        onChange={m.onDimensionChange}
      />
      <ArenaBody
        loading={m.pairQuery.isLoading || m.pairQuery.isFetching}
        error={m.pairQuery.error ? m.pairQuery.error.message : null}
        onRetry={m.pairQuery.refetch}
        pair={m.pair}
        watchlistedMoviesSize={m.watchlist.watchlistedMovies.size}
        activeDimName={m.activeDimName}
        activeDimDesc={m.activeDimDesc}
        scoreDelta={m.actions.scoreDelta}
        watchlistedMovies={m.watchlist.watchlistedMovies}
        watchlistPending={m.watchlist.pending}
        stalePending={m.actions.markStalePending}
        naPending={m.actions.naPending}
        blacklistPending={m.blacklist.isPending}
        isPending={m.actions.isPending}
        skipPending={m.actions.skipPending}
        onPick={m.actions.handlePick}
        onDraw={m.actions.handleDraw}
        onSkip={m.actions.handleSkip}
        onMarkStale={m.actions.handleMarkStale}
        onNA={m.actions.handleNA}
        onToggleWatchlist={m.watchlist.handleToggleWatchlist}
        onBlacklist={m.blacklist.open}
      />
      <BlacklistConfirmDialog
        target={m.blacklist.target}
        comparisonsToPurge={m.blacklist.comparisonsToPurge}
        isPending={m.blacklist.isPending}
        onConfirm={m.blacklist.confirm}
        onCancel={m.blacklist.cancel}
      />
    </div>
  );
}

interface ArenaBodyProps {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  pair: PairData | null | undefined;
  watchlistedMoviesSize: number;
  activeDimName: string;
  activeDimDesc: string | null;
  scoreDelta: ReturnType<typeof useArenaActions>['scoreDelta'];
  watchlistedMovies: Map<number, number>;
  watchlistPending: boolean;
  stalePending: boolean;
  naPending: boolean;
  blacklistPending: boolean;
  isPending: boolean;
  skipPending: boolean;
  onPick: (id: number) => void;
  onDraw: (tier: 'high' | 'mid' | 'low') => void;
  onSkip: () => void;
  onMarkStale: (id: number) => void;
  onNA: (id: number) => void;
  onToggleWatchlist: (id: number) => void;
  onBlacklist: (movie: { id: number; title: string }) => void;
}

function ArenaBody(props: ArenaBodyProps) {
  if (props.loading) return <ArenaSkeleton />;
  if (props.error) return <ArenaError message={props.error} onRetry={props.onRetry} />;
  if (props.pair === null) {
    return <ArenaEmptyState watchlistedCount={props.watchlistedMoviesSize} />;
  }
  if (props.pair === undefined) return null;

  return (
    <>
      <ArenaPrompt dimensionName={props.activeDimName} dimensionDescription={props.activeDimDesc} />
      <ArenaPair
        pair={props.pair}
        scoreDelta={props.scoreDelta}
        onDraw={props.onDraw}
        onSkip={props.onSkip}
        skipPending={props.skipPending}
        watchlistedMovies={props.watchlistedMovies}
        watchlistPending={props.watchlistPending}
        stalePending={props.stalePending}
        naPending={props.naPending}
        blacklistPending={props.blacklistPending}
        isPending={props.isPending}
        onPick={props.onPick}
        onToggleWatchlist={props.onToggleWatchlist}
        onMarkStale={props.onMarkStale}
        onNA={props.onNA}
        onBlacklist={props.onBlacklist}
      />
    </>
  );
}
