import { LayoutGrid } from 'lucide-react';

/**
 * TierListPage — dimension selector + TierListBoard for drag-and-drop tier placement.
 */
import { Alert, AlertDescription, AlertTitle } from '@pops/ui';

import { TierListSummary } from '../components/TierListSummary';
import { BlacklistDialog } from './tier-list/BlacklistDialog';
import { DimensionChips } from './tier-list/DimensionChips';
import { PoolSkeleton } from './tier-list/PoolSkeleton';
import { TierBoardSection } from './tier-list/TierBoardSection';
import { useTierListPageModel } from './tier-list/useTierListPageModel';

function NoActiveDimensions() {
  return (
    <div className="text-center py-16">
      <p className="text-muted-foreground">No active dimensions. Create one to get started.</p>
    </div>
  );
}

function TierListBody({ m }: { m: ReturnType<typeof useTierListPageModel> }) {
  if (m.submitState.result) {
    return (
      <TierListSummary
        comparisonsRecorded={m.submitState.result.comparisonsRecorded}
        scoreChanges={m.submitState.result.scoreChanges}
        onDoAnother={m.handleDoAnother}
        onDone={m.handleDone}
      />
    );
  }
  if (!m.effectiveDimension) return null;
  return (
    <TierBoardSection
      movies={m.movies}
      moviesLoading={m.tierMoviesQuery.isLoading}
      moviesError={m.tierMoviesQuery.error ? { message: m.tierMoviesQuery.error.message } : null}
      isPending={m.submitState.isPending}
      isFetching={m.tierMoviesQuery.isFetching}
      refetch={m.tierMoviesQuery.refetch}
      handleSubmit={m.handleSubmit}
      handleNotWatched={m.mutations.handleNotWatched}
      handleMarkStale={m.mutations.handleMarkStale}
      handleNA={m.mutations.handleNA}
    />
  );
}

function TierListMain({ m }: { m: ReturnType<typeof useTierListPageModel> }) {
  if (m.dimsLoading) return <PoolSkeleton />;
  if (m.activeDimensions.length === 0) return <NoActiveDimensions />;
  return (
    <>
      <DimensionChips
        activeDimensions={m.activeDimensions}
        effectiveDimension={m.effectiveDimension}
        onChange={m.handleDimensionChange}
      />
      {m.submitState.error && (
        <Alert variant="destructive">
          <AlertTitle>Submission Failed</AlertTitle>
          <AlertDescription>{m.submitState.error.message}</AlertDescription>
        </Alert>
      )}
      <TierListBody m={m} />
    </>
  );
}

export function TierListPage() {
  const m = useTierListPageModel();

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <LayoutGrid className="h-6 w-6 text-app-accent" />
        <h1 className="text-2xl font-bold">Tier List</h1>
      </div>
      <TierListMain m={m} />
      <BlacklistDialog
        blacklistTarget={m.mutations.blacklistTarget}
        onCancel={() => m.mutations.setBlacklistTarget(null)}
        onConfirm={() => {
          if (m.mutations.blacklistTarget) {
            m.mutations.blacklistMutation.mutate({
              mediaType: 'movie',
              mediaId: m.mutations.blacklistTarget.id,
            });
          }
        }}
        isPending={m.mutations.blacklistMutation.isPending}
      />
    </div>
  );
}
