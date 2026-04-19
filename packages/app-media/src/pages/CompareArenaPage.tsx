import { useCallback, useState } from 'react';

import { trpc } from '@pops/api-client';

import { BlacklistConfirmDialog } from '../components/BlacklistConfirmDialog';
import { ComparisonMovieCardSkeleton } from '../components/ComparisonMovieCard';
import { ArenaDimensionPicker } from './compare-arena/ArenaDimensionPicker';
import { ArenaEmptyState } from './compare-arena/ArenaEmptyState';
import { ArenaHeader } from './compare-arena/ArenaHeader';
import { ArenaPair } from './compare-arena/ArenaPair';
import { ArenaPrompt } from './compare-arena/ArenaPrompt';
import { useArenaActions } from './compare-arena/useArenaActions';
import { useArenaBlacklist } from './compare-arena/useArenaBlacklist';
import { useArenaWatchlist } from './compare-arena/useArenaWatchlist';

import type { Dimension, PairData } from './compare-arena/types';

function ArenaError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <p className="text-lg mb-2">Something went wrong</p>
      <p className="text-sm">
        {message}{' '}
        <button onClick={onRetry} className="text-primary underline">
          Try again
        </button>
      </p>
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
  const [manualDimensionId, setManualDimensionId] = useState<number | null>(null);

  const { data: dimensionsData, isLoading: dimsLoading } =
    trpc.media.comparisons.listDimensions.useQuery();
  const activeDimensions: Dimension[] =
    dimensionsData?.data?.filter((d: { active: boolean }) => d.active) ?? [];

  const {
    data: pairData,
    isLoading: pairLoading,
    isFetching: pairFetching,
    error: pairError,
    refetch: refetchPair,
  } = trpc.media.comparisons.getSmartPair.useQuery(
    manualDimensionId ? { dimensionId: manualDimensionId } : {},
    { enabled: activeDimensions.length > 0, refetchOnWindowFocus: false, gcTime: 0, staleTime: 0 }
  );

  const utils = trpc.useUtils();
  // `pair === undefined` means the query hasn't returned yet (e.g. dimensions
  // haven't loaded so the smartPair query is disabled). `pair === null` is the
  // explicit "no pair available" empty-state result from the backend. Keep
  // these separate so we don't show "not enough movies" while still loading.
  const pair: PairData | null | undefined = pairData?.data;
  const dimensionId = pair?.dimensionId ?? null;

  const resolveTitle = useCallback(
    (mediaId: number) => {
      if (pair?.movieA.id === mediaId) return pair.movieA.title;
      if (pair?.movieB.id === mediaId) return pair.movieB.title;
      return 'Movie';
    },
    [pair]
  );

  const onAfterAction = useCallback(() => setManualDimensionId(null), []);

  const watchlist = useArenaWatchlist({ enabled: !!pair, resolveTitle });
  const actions = useArenaActions({ pair, dimensionId, resolveTitle, onAfterAction });
  const blacklist = useArenaBlacklist({ resolveTitle, onAfterAction });

  const activeDim = activeDimensions.find((d) => d.id === dimensionId);
  const activeDimName = activeDim?.name ?? 'Overall';
  const activeDimDesc = activeDim?.description ?? null;

  const onDimensionChange = useCallback(
    (id: number) => {
      setManualDimensionId(id);
      actions.setScoreDelta(null);
      void utils.media.comparisons.getSmartPair.invalidate();
    },
    [actions, utils]
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <ArenaHeader sessionCount={actions.sessionCount} />

      <ArenaDimensionPicker
        loading={dimsLoading}
        activeDimensions={activeDimensions}
        dimensionId={dimensionId}
        onChange={onDimensionChange}
      />

      <ArenaBody
        loading={pairLoading || pairFetching}
        error={pairError ? pairError.message : null}
        onRetry={refetchPair}
        pair={pair}
        watchlistedMoviesSize={watchlist.watchlistedMovies.size}
        activeDimName={activeDimName}
        activeDimDesc={activeDimDesc}
        scoreDelta={actions.scoreDelta}
        watchlistedMovies={watchlist.watchlistedMovies}
        watchlistPending={watchlist.pending}
        stalePending={actions.markStalePending}
        naPending={actions.naPending}
        blacklistPending={blacklist.isPending}
        isPending={actions.isPending}
        skipPending={actions.skipPending}
        onPick={actions.handlePick}
        onDraw={actions.handleDraw}
        onSkip={actions.handleSkip}
        onMarkStale={actions.handleMarkStale}
        onNA={actions.handleNA}
        onToggleWatchlist={watchlist.handleToggleWatchlist}
        onBlacklist={blacklist.open}
      />

      <BlacklistConfirmDialog
        target={blacklist.target}
        comparisonsToPurge={blacklist.comparisonsToPurge}
        isPending={blacklist.isPending}
        onConfirm={blacklist.confirm}
        onCancel={blacklist.cancel}
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
