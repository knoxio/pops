import { Link } from 'react-router';

/**
 * HistoryPage — watch history with filter tabs, pagination, and delete.
 */
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Button,
} from '@pops/ui';

import { HistoryListSection } from './history/HistoryListSection';
import { HistorySkeleton } from './history/HistorySkeleton';
import { FILTER_OPTIONS, getEmptyHistoryMessage, type MediaTypeFilter } from './history/types';
import { useHistoryPageModel } from './history/useHistoryPageModel';

function FilterTabs({
  filter,
  onFilterChange,
}: {
  filter: MediaTypeFilter;
  onFilterChange: (v: MediaTypeFilter) => void;
}) {
  return (
    <div className="flex gap-2">
      {FILTER_OPTIONS.map((opt) => (
        <Button
          key={opt.value}
          variant={filter === opt.value ? 'default' : 'secondary'}
          size="sm"
          onClick={() => onFilterChange(opt.value)}
          shape="pill"
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

function EmptyView({ filter }: { filter: MediaTypeFilter }) {
  return (
    <div className="text-center py-16">
      <p className="text-muted-foreground">{getEmptyHistoryMessage(filter)}</p>
      <Link to="/media" className="mt-4 inline-block text-sm text-primary underline">
        Browse library
      </Link>
    </div>
  );
}

function DeleteDialog({
  deleteTarget,
  onCancel,
  onConfirm,
}: {
  deleteTarget: number | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove watch event?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove this entry from your watch history. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function HistoryPage() {
  const m = useHistoryPageModel();

  function renderBody() {
    if (m.error) {
      return (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{m.error.message}</AlertDescription>
        </Alert>
      );
    }
    if (m.isLoading) return <HistorySkeleton />;
    if (m.entries.length === 0) return <EmptyView filter={m.filter} />;
    return (
      <HistoryListSection
        entries={m.entries}
        isDeleting={m.deleteMutation.isPending}
        onDelete={m.handleDeleteClick}
        debriefByMovieId={m.debriefByMovieId}
        offset={m.offset}
        total={m.total}
        hasMore={m.hasMore}
        onPageChange={m.setOffset}
      />
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Watch History</h1>
      <FilterTabs
        filter={m.filter}
        onFilterChange={(v) => {
          m.setFilter(v);
          m.setOffset(0);
        }}
      />
      {renderBody()}
      <DeleteDialog
        deleteTarget={m.deleteTarget}
        onCancel={() => m.setDeleteTarget(null)}
        onConfirm={m.handleDeleteConfirm}
      />
    </div>
  );
}
