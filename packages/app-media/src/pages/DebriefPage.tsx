/**
 * Debrief page — post-watch comparison flow for a debrief session.
 *
 * Route: /media/debrief/:movieId
 *
 * Shows movie poster header, dimension progress tracker, and comparison
 * cards with Pick A / Pick B / draw-tier buttons.
 */
import { Link, useParams } from 'react-router';

import { PageHeader } from '@pops/ui';

import { BlacklistConfirmDialog } from '../components/BlacklistConfirmDialog';
import { DebriefActionBar } from '../components/DebriefControls';
import { DebriefComparison } from './debrief/DebriefComparison';
import { DebriefHeader } from './debrief/DebriefHeader';
import { DebriefSkeleton } from './debrief/DebriefSkeleton';
import { DimensionProgress } from './debrief/DimensionProgress';
import { useDebriefPageModel } from './debrief/useDebriefPageModel';

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

function DebriefComparisonSection({
  model,
  debrief,
}: {
  model: ReturnType<typeof useDebriefPageModel>;
  debrief: Debrief;
}) {
  if (model.allComplete || !model.currentDimension) return null;
  return (
    <DebriefComparison
      movie={debrief.movie}
      dimension={model.currentDimension}
      isPending={model.recordMutation.isPending}
      watchlistedMovies={model.watchlist.watchlistedMovies}
      watchlistPending={model.watchlist.pending}
      stalePending={model.destructive.markStalePending}
      naPending={model.destructive.naPending}
      blacklistPending={model.destructive.blacklistPending}
      onPick={model.handlePick}
      onDraw={model.handleDraw}
      onToggleWatchlist={model.watchlist.handleToggleWatchlist}
      onMarkStale={model.destructive.handleMarkStale}
      onNA={model.destructive.handleNA}
      onBlacklist={model.destructive.openBlacklist}
    />
  );
}

function DebriefPageBody({
  model,
  debrief,
}: {
  model: ReturnType<typeof useDebriefPageModel>;
  debrief: Debrief;
}) {
  const summaryData = buildSummaryData(debrief, model.allComplete);
  return (
    <>
      <DebriefHeader
        movie={debrief.movie}
        pendingCount={model.pendingDimensions.length}
        allComplete={model.allComplete}
      />
      <DimensionProgress
        dimensions={debrief.dimensions}
        currentDimensionId={model.currentDimension?.dimensionId ?? null}
      />
      <DebriefComparisonSection model={model} debrief={debrief} />
      <div className="flex justify-center">
        <DebriefActionBar
          sessionId={debrief.sessionId}
          currentDimension={
            model.currentDimension
              ? { id: model.currentDimension.dimensionId, name: model.currentDimension.name }
              : null
          }
          allComplete={model.allComplete}
          summaryData={summaryData}
          onDimensionSkipped={model.handleDimensionSkipped}
          onDoAnother={model.handleDoAnother}
        />
      </div>
      <BlacklistConfirmDialog
        target={model.destructive.blacklistTarget}
        comparisonsToPurge={model.destructive.comparisonsToPurge}
        isPending={model.destructive.blacklistPending}
        onConfirm={model.destructive.confirmBlacklist}
        onCancel={model.destructive.cancelBlacklist}
      />
    </>
  );
}

export function DebriefPage() {
  const { movieId: rawId } = useParams<{ movieId: string }>();
  const movieId = Number(rawId);
  const model = useDebriefPageModel(movieId);

  if (Number.isNaN(movieId) || movieId <= 0) return <InvalidIdMessage />;
  if (model.isLoading) return <DebriefSkeleton />;
  if (model.error || !model.debrief) {
    return (
      <ErrorMessage message={model.error?.message ?? 'Session not found'} onRetry={model.refetch} />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader
        title={model.debrief.movie.title}
        backHref="/media/history"
        breadcrumbs={[
          { label: 'Media', href: '/media' },
          { label: 'History', href: '/media/history' },
          { label: model.debrief.movie.title },
        ]}
        renderLink={Link}
      />
      <DebriefPageBody model={model} debrief={model.debrief} />
    </div>
  );
}
