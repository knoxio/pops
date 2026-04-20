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

function useCompareArenaPageModel() {
  const [manualDimensionId, setManualDimensionId] = useState<number | null>(null);

  const { data: dimensionsData, isLoading: dimsLoading } =
    trpc.media.comparisons.listDimensions.useQuery();
  const activeDimensions: Dimension[] =
    dimensionsData?.data?.filter((d: { active: boolean }) => d.active) ?? [];

  const pairQuery = trpc.media.comparisons.getSmartPair.useQuery(
    manualDimensionId ? { dimensionId: manualDimensionId } : {},
    { enabled: activeDimensions.length > 0, refetchOnWindowFocus: false, gcTime: 0, staleTime: 0 }
  );

  const utils = trpc.useUtils();
  const pair: PairData | null | undefined = pairQuery.data?.data;
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

  const onDimensionChange = useCallback(
    (id: number) => {
      setManualDimensionId(id);
      actions.setScoreDelta(null);
      void utils.media.comparisons.getSmartPair.invalidate();
    },
    [actions, utils]
  );

  return {
    dimsLoading,
    activeDimensions,
    pair,
    pairQuery,
    dimensionId,
    activeDimName: activeDim?.name ?? 'Overall',
    activeDimDesc: activeDim?.description ?? null,
    watchlist,
    actions,
    blacklist,
    onDimensionChange,
  };
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
