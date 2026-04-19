/**
 * Debrief page — post-watch comparison flow for a debrief session.
 *
 * Route: /media/debrief/:movieId
 *
 * Shows movie poster header, dimension progress tracker, and comparison
 * cards with Pick A / Pick B / draw-tier buttons. Uses getDebrief query
 * and recordDebriefComparison mutation. Advances through pending
 * dimensions; shows CompletionSummary when all are done.
 *
 * Each comparison card exposes the same action overlay as the Arena:
 * watchlist toggle, mark stale, N/A exclusion, and blacklist (not watched).
 */
import { useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import { PageHeader } from '@pops/ui';

import { BlacklistConfirmDialog } from '../components/BlacklistConfirmDialog';
import { DebriefActionBar } from '../components/DebriefControls';
import { DebriefComparison } from './debrief/DebriefComparison';
import { DebriefHeader } from './debrief/DebriefHeader';
import { DebriefSkeleton } from './debrief/DebriefSkeleton';
import { DimensionProgress } from './debrief/DimensionProgress';
import { useDebriefDestructiveActions } from './debrief/useDebriefDestructiveActions';
import { useDebriefWatchlist } from './debrief/useDebriefWatchlist';

import type { Debrief } from './debrief/types';

function InvalidIdMessage() {
  return (
    <div className="p-6 text-center text-muted-foreground">
      <p>Invalid movie ID.</p>
      <Link to="/media" className="text-primary underline">
        Back to library
      </Link>
    </div>
  );
}

function ErrorMessage({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="p-6 text-center text-muted-foreground" data-testid="debrief-error">
      <p className="mb-2 text-lg">Could not load debrief</p>
      <p className="text-sm">
        {message}{' '}
        <button onClick={onRetry} className="text-primary underline">
          Try again
        </button>
      </p>
    </div>
  );
}

function buildSummaryData(debrief: Debrief, allComplete: boolean) {
  if (!allComplete) return null;
  return {
    sessionId: debrief.sessionId,
    movieTitle: debrief.movie.title,
    dimensions: debrief.dimensions.map((d) => ({
      dimensionId: d.dimensionId,
      name: d.name,
      status: d.status,
      comparisonId: d.comparisonId,
    })),
  };
}

export function DebriefPage() {
  const { movieId: rawId } = useParams<{ movieId: string }>();
  const movieId = Number(rawId);
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const {
    data: debriefData,
    isLoading,
    error,
    refetch,
  } = trpc.media.comparisons.getDebrief.useQuery(
    { mediaType: 'movie', mediaId: movieId },
    { enabled: !Number.isNaN(movieId) && movieId > 0 }
  );

  const debrief: Debrief | undefined = debriefData?.data;
  const pendingDimensions = debrief?.dimensions.filter((d) => d.status === 'pending') ?? [];
  const allComplete = debrief ? pendingDimensions.length === 0 : false;
  const currentDimension = pendingDimensions[0] ?? null;

  const recordMutation = trpc.media.comparisons.recordDebriefComparison.useMutation({
    onSuccess: (result) => {
      toast.success(result.data.sessionComplete ? 'Debrief complete!' : 'Comparison recorded');
      void utils.media.comparisons.getDebrief.invalidate({ mediaType: 'movie', mediaId: movieId });
      void utils.media.comparisons.getPendingDebriefs.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const resolveTitle = useCallback(
    (id: number) => {
      if (id === debrief?.movie.mediaId) return debrief.movie.title;
      if (id === currentDimension?.opponent?.id) return currentDimension.opponent.title;
      return 'Movie';
    },
    [debrief, currentDimension]
  );

  const watchlist = useDebriefWatchlist({ enabled: !!debrief, resolveTitle });
  const destructive = useDebriefDestructiveActions({
    movieId,
    currentDimensionId: currentDimension?.dimensionId ?? null,
    resolveTitle,
  });

  const handlePick = useCallback(
    (winnerId: number) => {
      if (!currentDimension?.opponent || !debrief || recordMutation.isPending) return;
      recordMutation.mutate({
        sessionId: debrief.sessionId,
        dimensionId: currentDimension.dimensionId,
        opponentType: 'movie' as const,
        opponentId: currentDimension.opponent.id,
        winnerId,
      });
    },
    [currentDimension, debrief, recordMutation]
  );

  const handleDraw = useCallback(
    (tier: 'high' | 'mid' | 'low') => {
      if (!currentDimension?.opponent || !debrief || recordMutation.isPending) return;
      recordMutation.mutate({
        sessionId: debrief.sessionId,
        dimensionId: currentDimension.dimensionId,
        opponentType: 'movie' as const,
        opponentId: currentDimension.opponent.id,
        winnerId: 0,
        drawTier: tier,
      });
    },
    [currentDimension, debrief, recordMutation]
  );

  const handleDimensionSkipped = useCallback(() => {
    void utils.media.comparisons.getDebrief.invalidate({ mediaType: 'movie', mediaId: movieId });
  }, [utils, movieId]);

  const handleDoAnother = useCallback(() => navigate('/media/compare'), [navigate]);

  if (Number.isNaN(movieId) || movieId <= 0) return <InvalidIdMessage />;
  if (isLoading) return <DebriefSkeleton />;
  if (error || !debrief) {
    return <ErrorMessage message={error?.message ?? 'Session not found'} onRetry={refetch} />;
  }

  const summaryData = buildSummaryData(debrief, allComplete);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader
        title={debrief.movie.title}
        backHref="/media/history"
        breadcrumbs={[
          { label: 'Media', href: '/media' },
          { label: 'History', href: '/media/history' },
          { label: debrief.movie.title },
        ]}
        renderLink={Link}
      />

      <DebriefHeader
        movie={debrief.movie}
        pendingCount={pendingDimensions.length}
        allComplete={allComplete}
      />

      <DimensionProgress
        dimensions={debrief.dimensions}
        currentDimensionId={currentDimension?.dimensionId ?? null}
      />

      {!allComplete && currentDimension && (
        <DebriefComparison
          movie={debrief.movie}
          dimension={currentDimension}
          isPending={recordMutation.isPending}
          watchlistedMovies={watchlist.watchlistedMovies}
          watchlistPending={watchlist.pending}
          stalePending={destructive.markStalePending}
          naPending={destructive.naPending}
          blacklistPending={destructive.blacklistPending}
          onPick={handlePick}
          onDraw={handleDraw}
          onToggleWatchlist={watchlist.handleToggleWatchlist}
          onMarkStale={destructive.handleMarkStale}
          onNA={destructive.handleNA}
          onBlacklist={destructive.openBlacklist}
        />
      )}

      <div className="flex justify-center">
        <DebriefActionBar
          sessionId={debrief.sessionId}
          currentDimension={
            currentDimension
              ? { id: currentDimension.dimensionId, name: currentDimension.name }
              : null
          }
          allComplete={allComplete}
          summaryData={summaryData}
          onDimensionSkipped={handleDimensionSkipped}
          onDoAnother={handleDoAnother}
        />
      </div>

      <BlacklistConfirmDialog
        target={destructive.blacklistTarget}
        comparisonsToPurge={destructive.comparisonsToPurge}
        isPending={destructive.blacklistPending}
        onConfirm={destructive.confirmBlacklist}
        onCancel={destructive.cancelBlacklist}
      />
    </div>
  );
}
