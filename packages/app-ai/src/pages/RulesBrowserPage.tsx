/**
 * RulesBrowserPage — browse, filter, adjust, and delete AI categorisation rules.
 * PRD-053/US-02 (tb-542).
 */
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PageHeader,
  Select,
  type SelectOption,
  Skeleton,
  Slider,
  SortableHeader,
  TextInput,
} from '@pops/ui';
import type { ColumnDef } from '@tanstack/react-table';
import { BookOpen, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { trpc } from '../lib/trpc';

type MatchType = 'exact' | 'contains' | 'regex';

interface Correction {
  id: string;
  descriptionPattern: string;
  matchType: MatchType;
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  tags: string[];
  transactionType: 'purchase' | 'transfer' | 'income' | null;
  confidence: number;
  timesApplied: number;
  createdAt: string;
  lastUsedAt: string | null;
}

const MATCH_TYPE_OPTIONS: SelectOption[] = [
  { value: '', label: 'All Match Types' },
  { value: 'exact', label: 'Exact' },
  { value: 'contains', label: 'Contains' },
  { value: 'regex', label: 'Regex' },
];

const PAGE_SIZE = 50;

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function ConfidenceSlider({
  ruleId,
  initial,
  onAutoDelete,
}: {
  ruleId: string;
  initial: number;
  onAutoDelete: (id: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRef = useRef(initial);
  const utils = trpc.useUtils();

  // Keep initialRef in sync when the prop changes (e.g. after query invalidation)
  useEffect(() => {
    initialRef.current = initial;
    setValue(initial);
  }, [initial]);

  const adjustMutation = trpc.core.corrections.adjustConfidence.useMutation({
    onSuccess: () => {
      void utils.core.corrections.list.invalidate();
    },
  });

  const commit = useCallback(
    (newValue: number) => {
      const delta = newValue - initialRef.current;
      if (Math.abs(delta) < 0.001) return;
      adjustMutation.mutate(
        { id: ruleId, delta },
        {
          onSuccess: () => {
            if (newValue < 0.3) {
              onAutoDelete(ruleId);
            }
          },
        }
      );
    },
    [ruleId, adjustMutation, onAutoDelete]
  );

  const handleChange = (values: number[]) => {
    const next = values[0] ?? value;
    setValue(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => commit(next), 400);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 min-w-35">
      <Slider
        min={0}
        max={1}
        step={0.01}
        value={[value]}
        onValueChange={handleChange}
        className="w-20"
        aria-label={`Confidence for rule ${ruleId}`}
      />
      <span className="text-xs tabular-nums w-10 text-right">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

export function RulesBrowserPage(): React.ReactElement {
  const [matchType, setMatchType] = useState('');
  const [minConfidence, setMinConfidence] = useState('');
  const [offset, setOffset] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const parsedMinConfidence = minConfidence ? parseFloat(minConfidence) : undefined;
  const parsedMatchType: MatchType | undefined =
    matchType === 'exact' || matchType === 'contains' || matchType === 'regex'
      ? matchType
      : undefined;
  const queryInput = {
    minConfidence: parsedMinConfidence,
    matchType: parsedMatchType,
    limit: PAGE_SIZE,
    offset,
  };

  const { data, isLoading, isError, refetch } = trpc.core.corrections.list.useQuery(queryInput);
  const utils = trpc.useUtils();

  const deleteMutation = trpc.core.corrections.delete.useMutation({
    onSuccess: () => {
      void utils.core.corrections.list.invalidate();
      setDeleteId(null);
      setRemovedIds(new Set());
    },
  });

  const handleDelete = useCallback(() => {
    if (!deleteId) return;
    deleteMutation.mutate({ id: deleteId });
  }, [deleteId, deleteMutation]);

  const handleAutoDelete = useCallback((id: string) => {
    setRemovedIds((prev) => new Set(prev).add(id));
  }, []);

  const corrections: Correction[] = (data?.data ?? []).filter(
    (c: Correction) => !removedIds.has(c.id)
  );
  const pagination = data?.pagination;

  const columns: ColumnDef<Correction>[] = [
    {
      accessorKey: 'descriptionPattern',
      header: ({ column }) => <SortableHeader column={column}>Pattern</SortableHeader>,
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.descriptionPattern}</span>
      ),
    },
    {
      accessorKey: 'matchType',
      header: 'Match Type',
      cell: ({ row }) => <Badge variant="outline">{row.original.matchType}</Badge>,
    },
    {
      accessorKey: 'entityName',
      header: ({ column }) => <SortableHeader column={column}>Entity</SortableHeader>,
      cell: ({ row }) =>
        row.original.entityName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'confidence',
      header: ({ column }) => <SortableHeader column={column}>Confidence</SortableHeader>,
      cell: ({ row }) => (
        <ConfidenceSlider
          key={`${row.original.id}-${row.original.confidence}`}
          ruleId={row.original.id}
          initial={row.original.confidence}
          onAutoDelete={handleAutoDelete}
        />
      ),
    },
    {
      accessorKey: 'timesApplied',
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>Times Applied</SortableHeader>
        </div>
      ),
      cell: ({ row }) => <div className="text-right tabular-nums">{row.original.timesApplied}</div>,
    },
    {
      accessorKey: 'lastUsedAt',
      header: ({ column }) => <SortableHeader column={column}>Last Used</SortableHeader>,
      cell: ({ row }) =>
        row.original.lastUsedAt ? (
          formatDate(row.original.lastUsedAt)
        ) : (
          <span className="text-muted-foreground">Never</span>
        ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setDeleteId(row.original.id);
          }}
          aria-label={`Delete rule ${row.original.descriptionPattern}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Categorisation Rules"
          description="Browse and manage AI categorisation rules"
        />
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Categorisation Rules"
          description="Browse and manage AI categorisation rules"
        />
        <Alert variant="destructive">
          <h3 className="font-semibold">Failed to load rules</h3>
          <p className="text-sm mt-1">Something went wrong loading categorisation rules.</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
            Retry
          </Button>
        </Alert>
      </div>
    );
  }

  const totalPages = pagination ? Math.ceil(pagination.total / PAGE_SIZE) : 1;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorisation Rules"
        description="Browse and manage AI categorisation rules"
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <Select
          value={matchType}
          onChange={(e) => {
            setMatchType(e.target.value);
            setOffset(0);
          }}
          options={MATCH_TYPE_OPTIONS}
          placeholder="All Match Types"
          className="w-44"
        />
        <TextInput
          type="number"
          placeholder="Min confidence (0-1)"
          value={minConfidence}
          onChange={(e) => {
            setMinConfidence(e.target.value);
            setOffset(0);
          }}
          className="w-44"
          min={0}
          max={1}
          step={0.1}
        />
        {(matchType || minConfidence) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMatchType('');
              setMinConfidence('');
              setOffset(0);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      {corrections.length === 0 ? (
        <Card className="p-12 text-center">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">No categorisation rules found.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Rules are created automatically when AI categorises transactions.
          </p>
        </Card>
      ) : (
        <DataTable columns={columns} data={corrections} paginated defaultPageSize={PAGE_SIZE} />
      )}

      {/* Server-side pagination */}
      {pagination && pagination.total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, pagination.total)} of{' '}
            {pagination.total} rules
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete Rule</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this categorisation rule? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
