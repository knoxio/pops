/**
 * ComparisonHistoryPage — paginated list of all comparisons with delete capability.
 * Allows users to review past comparisons and undo mistakes.
 */
import { Button, Card, CardContent, Input, Select, Skeleton } from '@pops/ui';
import { ChevronLeft, ChevronRight, History, Trash2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '../lib/trpc';

const PAGE_SIZE = 20;
const UNDO_DELAY_MS = 5000;

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function ComparisonHistoryPage() {
  const [page, setPage] = useState(0);
  const [dimensionFilter, setDimensionFilter] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  const [pendingDeletes, setPendingDeletes] = useState<Set<number>>(new Set());
  const pendingTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const { data: dimensionsData } = trpc.media.comparisons.listDimensions.useQuery();
  const dimensions = dimensionsData?.data ?? [];

  const parsedDimensionId = dimensionFilter ? Number(dimensionFilter) : undefined;
  const searchParam = debouncedSearch.trim() || undefined;

  const { data, isLoading } = trpc.media.comparisons.listAll.useQuery({
    dimensionId: parsedDimensionId,
    search: searchParam,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const utils = trpc.useUtils();

  const deleteMutation = trpc.media.comparisons.delete.useMutation({
    onSuccess: (_data, variables) => {
      setPendingDeletes((prev) => {
        const next = new Set(prev);
        next.delete(variables.id);
        return next;
      });
      void utils.media.comparisons.listAll.invalidate();
      void utils.media.comparisons.scores.invalidate();
      void utils.media.comparisons.rankings.invalidate();
    },
    onError: (_error, variables) => {
      setPendingDeletes((prev) => {
        const next = new Set(prev);
        next.delete(variables.id);
        return next;
      });
      toast.error('Failed to delete comparison');
    },
  });

  const handleUndo = useCallback((id: number, toastId: string | number) => {
    const timer = pendingTimers.current.get(id);
    if (timer) clearTimeout(timer);
    pendingTimers.current.delete(id);
    setPendingDeletes((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    toast.dismiss(toastId);
  }, []);

  const allComparisons = data?.data ?? [];
  const comparisons = allComparisons.filter((c: { id: number }) => !pendingDeletes.has(c.id));
  const totalPages = data?.pagination ? Math.ceil(data.pagination.total / PAGE_SIZE) : 0;

  const dimensionOptions = [
    { label: 'All dimensions', value: '' },
    ...dimensions.map((d: { id: number; name: string }) => ({
      label: d.name,
      value: String(d.id),
    })),
  ];

  const dimensionMap = new Map(dimensions.map((d: { id: number; name: string }) => [d.id, d.name]));

  function handleDelete(id: number) {
    setPendingDeletes((prev) => new Set(prev).add(id));

    const toastId = toast.custom(
      (tId) => <UndoToast toastId={tId} onUndo={() => handleUndo(id, tId)} />,
      { duration: UNDO_DELAY_MS + 500 }
    );

    const timer = setTimeout(() => {
      pendingTimers.current.delete(id);
      toast.dismiss(toastId);
      deleteMutation.mutate({ id });
    }, UNDO_DELAY_MS);

    pendingTimers.current.set(id, timer);
  }

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

      <div className="flex items-center gap-4">
        <Input
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(0);
          }}
          placeholder="Search by movie title…"
          className="w-56"
        />
        <Select
          value={dimensionFilter}
          onChange={(e) => {
            setDimensionFilter(e.target.value);
            setPage(0);
          }}
          options={dimensionOptions}
          className="w-48"
        />
        {data?.pagination && (
          <span className="text-sm text-muted-foreground">
            {data.pagination.total} comparison{data.pagination.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : comparisons.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No comparisons yet. Head to the{' '}
            <Link to="/media/compare" className="text-primary underline">
              Compare Arena
            </Link>{' '}
            to start comparing movies.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {comparisons.map(
            (comp: {
              id: number;
              dimensionId: number;
              mediaAType: string;
              mediaAId: number;
              mediaBType: string;
              mediaBId: number;
              winnerType: string;
              winnerId: number;
              deltaA: number | null;
              deltaB: number | null;
              drawTier: string | null;
              comparedAt: string;
            }) => (
              <ComparisonRow
                key={comp.id}
                comparison={comp}
                dimensionName={dimensionMap.get(comp.dimensionId) ?? 'Unknown'}
                onDelete={handleDelete}
              />
            )
          )}
        </div>
      )}

      {totalPages > 1 && (
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
      )}
    </div>
  );
}

function EloDelta({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const isPositive = delta > 0;
  return (
    <span
      className={`text-2xs font-mono tabular-nums px-1 py-0.5 rounded ${
        isPositive
          ? 'text-success bg-success/10'
          : delta < 0
            ? 'text-destructive bg-destructive/10'
            : 'text-muted-foreground'
      }`}
    >
      {isPositive ? '+' : ''}
      {delta}
    </span>
  );
}

function ComparisonRow({
  comparison,
  dimensionName,
  onDelete,
}: {
  comparison: {
    id: number;
    mediaAId: number;
    mediaBId: number;
    winnerId: number;
    deltaA: number | null;
    deltaB: number | null;
    drawTier: string | null;
    comparedAt: string;
  };
  dimensionName: string;
  onDelete: (id: number) => void;
}) {
  const isDraw = comparison.winnerId === 0;
  const winnerId = comparison.winnerId;
  const loserId = comparison.mediaAId === winnerId ? comparison.mediaBId : comparison.mediaAId;
  const winnerDelta = comparison.mediaAId === winnerId ? comparison.deltaA : comparison.deltaB;
  const loserDelta = comparison.mediaAId === winnerId ? comparison.deltaB : comparison.deltaA;

  return (
    <Card className="group">
      <CardContent className="flex items-center justify-between p-3">
        <div className="flex items-center gap-4 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm">
              {isDraw ? (
                <>
                  <MovieTitle
                    mediaId={comparison.mediaAId}
                    className="font-semibold text-foreground"
                  />
                  <EloDelta delta={comparison.deltaA} />
                  <span className="text-muted-foreground">tied</span>
                  <MovieTitle mediaId={comparison.mediaBId} className="text-muted-foreground" />
                  <EloDelta delta={comparison.deltaB} />
                </>
              ) : (
                <>
                  <MovieTitle mediaId={winnerId} className="font-semibold text-foreground" />
                  <EloDelta delta={winnerDelta} />
                  <span className="text-muted-foreground">beat</span>
                  <MovieTitle mediaId={loserId} className="text-muted-foreground" />
                  <EloDelta delta={loserDelta} />
                </>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-2xs text-muted-foreground uppercase tracking-wider">
                {dimensionName}
              </span>
              {isDraw && comparison.drawTier && (
                <span className="text-2xs text-muted-foreground capitalize">
                  {comparison.drawTier} draw
                </span>
              )}
              <span className="text-2xs text-muted-foreground">
                {new Date(comparison.comparedAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(comparison.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

/** Toast with a shrinking progress bar and undo button. */
function UndoToast({ toastId, onUndo }: { toastId: string | number; onUndo: () => void }) {
  void toastId;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-4 py-3 w-72">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-foreground">Comparison deleted</span>
        <button
          onClick={onUndo}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          <Undo2 className="h-3.5 w-3.5" />
          Undo
        </button>
      </div>
      <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary animate-shrink-bar"
          style={
            {
              '--shrink-duration': `${UNDO_DELAY_MS}ms`,
            } as React.CSSProperties
          }
        />
      </div>
    </div>
  );
}

function MovieTitle({ mediaId, className }: { mediaId: number; className?: string }) {
  const { data } = trpc.media.movies.get.useQuery({ id: mediaId });
  const title = data?.data?.title ?? `Movie #${mediaId}`;
  return (
    <Link to={`/media/movies/${mediaId}`} className={className}>
      {title}
    </Link>
  );
}
