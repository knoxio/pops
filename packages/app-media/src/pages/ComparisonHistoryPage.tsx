import { ChevronLeft, ChevronRight, History } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';

/**
 * ComparisonHistoryPage — paginated list of all comparisons with delete capability.
 * Allows users to review past comparisons and undo mistakes.
 */
import { Button, Card, CardContent, Input, Select, Skeleton } from '@pops/ui';

import { ComparisonRow, type ComparisonRowData } from './comparison-history/ComparisonRow';
import { UndoToast } from './comparison-history/UndoToast';
import { useComparisonHistoryModel } from './comparison-history/useComparisonHistoryModel';

function FiltersBar({
  searchInput,
  onSearchChange,
  dimensionFilter,
  onDimensionChange,
  dimensionOptions,
  total,
}: {
  searchInput: string;
  onSearchChange: (v: string) => void;
  dimensionFilter: string;
  onDimensionChange: (v: string) => void;
  dimensionOptions: { label: string; value: string }[];
  total?: number;
}) {
  return (
    <div className="flex items-center gap-4">
      <Input
        value={searchInput}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search by movie title…"
        className="w-56"
      />
      <Select
        value={dimensionFilter}
        onChange={(e) => onDimensionChange(e.target.value)}
        options={dimensionOptions}
        className="w-48"
      />
      {total != null && (
        <span className="text-sm text-muted-foreground">
          {total} comparison{total !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

function PageNav({
  page,
  totalPages,
  setPage,
}: {
  page: number;
  totalPages: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setPage((p) => Math.max(0, p - 1))}
        disabled={page === 0}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {page + 1} of {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
        disabled={page >= totalPages - 1}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function EmptyView() {
  return (
    <Card>
      <CardContent className="p-8 text-center text-muted-foreground">
        No comparisons yet. Head to the{' '}
        <Link to="/media/compare" className="text-primary underline">
          Compare Arena
        </Link>{' '}
        to start comparing movies.
      </CardContent>
    </Card>
  );
}

function HistoryList({
  isLoading,
  comparisons,
  dimensionMap,
  onDelete,
}: {
  isLoading: boolean;
  comparisons: (ComparisonRowData & { dimensionId: number })[];
  dimensionMap: Map<number, string>;
  onDelete: (id: number) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (comparisons.length === 0) return <EmptyView />;
  return (
    <div className="space-y-2">
      {comparisons.map((comp) => (
        <ComparisonRow
          key={comp.id}
          comparison={comp}
          dimensionName={dimensionMap.get(comp.dimensionId) ?? 'Unknown'}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function renderUndoToast(_id: number, onUndo: (toastId: string | number) => void) {
  return toast.custom((tId) => <UndoToast toastId={tId} onUndo={() => onUndo(tId)} />, {
    duration: 5000 + 500,
  });
}

export function ComparisonHistoryPage() {
  const model = useComparisonHistoryModel(renderUndoToast);

  const allComparisons = model.data?.data ?? [];
  const comparisons = allComparisons.filter(
    (c: { id: number }) => !model.pendingDeletes.has(c.id)
  ) as (ComparisonRowData & { dimensionId: number })[];

  const dimensionOptions = [
    { label: 'All dimensions', value: '' },
    ...model.dimensions.map((d) => ({ label: d.name, value: String(d.id) })),
  ];
  const dimensionMap = new Map(model.dimensions.map((d) => [d.id, d.name]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Comparison History</h1>
        </div>
        <Link to="/media/compare">
          <Button variant="outline" size="sm">
            Back to Compare
          </Button>
        </Link>
      </div>

      <FiltersBar
        searchInput={model.searchInput}
        onSearchChange={(v) => {
          model.setSearchInput(v);
          model.setPage(0);
        }}
        dimensionFilter={model.dimensionFilter}
        onDimensionChange={(v) => {
          model.setDimensionFilter(v);
          model.setPage(0);
        }}
        dimensionOptions={dimensionOptions}
        total={model.data?.pagination?.total}
      />

      <HistoryList
        isLoading={model.isLoading}
        comparisons={comparisons}
        dimensionMap={dimensionMap}
        onDelete={model.handleDelete}
      />

      {model.totalPages > 1 && (
        <PageNav page={model.page} totalPages={model.totalPages} setPage={model.setPage} />
      )}
    </div>
  );
}
