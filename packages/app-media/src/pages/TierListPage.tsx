import { LayoutGrid, Plus } from 'lucide-react';

/**
 * TierListPage — dimension selector + TierListBoard for drag-and-drop tier placement.
 */
import { Alert, AlertDescription, AlertTitle, Button } from '@pops/ui';

import { TierListSummary } from '../components/TierListSummary';
import { BlacklistDialog } from './tier-list/BlacklistDialog';
import { CreateDimensionDialog } from './tier-list/CreateDimensionDialog';
import { DimensionChips } from './tier-list/DimensionChips';
import { PoolSkeleton } from './tier-list/PoolSkeleton';
import { TierBoardSection } from './tier-list/TierBoardSection';
import { useTierListPageModel } from './tier-list/useTierListPageModel';

function NoActiveDimensions({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="text-center py-16 space-y-4">
      <p className="text-muted-foreground">No active dimensions. Create one to get started.</p>
      <Button onClick={onCreate}>
        <Plus className="h-4 w-4 mr-1" />
        Create dimension
      </Button>
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

function DimensionHeader({ m }: { m: ReturnType<typeof useTierListPageModel> }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <DimensionChips
        activeDimensions={m.activeDimensions}
        effectiveDimension={m.effectiveDimension}
        onChange={m.handleDimensionChange}
      />
      <Button size="sm" variant="outline" onClick={() => m.setDialogOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />
        New
      </Button>
    </div>
  );
}

function TierListMain({ m }: { m: ReturnType<typeof useTierListPageModel> }) {
  if (m.dimsLoading) return <PoolSkeleton />;
  if (m.activeDimensions.length === 0)
    return <NoActiveDimensions onCreate={() => m.setDialogOpen(true)} />;
  return (
    <>
      <DimensionHeader m={m} />
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
      <CreateDimensionDialog
        open={m.dialogOpen}
        onOpenChange={m.setDialogOpen}
        onSubmit={m.handleCreateDimension}
        isPending={m.createDimensionMutation.isPending}
      />
    </div>
  );
}
