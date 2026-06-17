import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button, Skeleton } from '@pops/ui';

import { unwrap } from '../../media-api-helpers.js';
import { rotationListExclusions, rotationRemoveExclusion } from '../../media-api/index.js';
import { Pagination } from './Pagination';

const PAGE_SIZE = 20;

interface Exclusion {
  id: number;
  tmdbId: number;
  title: string;
  reason: string | null;
  excludedAt: string;
}

function ExclusionRow({
  e,
  onRestore,
  isPending,
}: {
  e: Exclusion;
  onRestore: (tmdbId: number) => void;
  isPending: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      <div className="flex-1 min-w-0">
        <span className="font-medium truncate">{e.title}</span>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          {e.reason && <span>{e.reason}</span>}
          <span>{new Date(e.excludedAt).toLocaleDateString()}</span>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onRestore(e.tmdbId)}
        disabled={isPending}
        title="Restore to queue"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function ExclusionList() {
  const [page, setPage] = useState(0);
  const queryClient = useQueryClient();

  const queryInput = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
  const query = useQuery({
    queryKey: ['media', 'rotation', 'listExclusions', queryInput],
    queryFn: async () => unwrap(await rotationListExclusions({ query: queryInput })),
  });

  const unexcludeMutation = useMutation({
    mutationFn: async (input: { tmdbId: number }) =>
      unwrap(await rotationRemoveExclusion({ path: { tmdbId: input.tmdbId } })),
    onSuccess: () => {
      toast.success('Exclusion removed');
      void queryClient.invalidateQueries({ queryKey: ['media', 'rotation', 'listExclusions'] });
      void queryClient.invalidateQueries({ queryKey: ['media', 'rotation', 'listCandidates'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to remove exclusion'),
  });

  const result = query.data?.data;
  const items: Exclusion[] = result?.items ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No exclusions</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {items.map((e) => (
          <ExclusionRow
            key={e.id}
            e={e}
            onRestore={(tmdbId) => unexcludeMutation.mutate({ tmdbId })}
            isPending={unexcludeMutation.isPending}
          />
        ))}
      </div>
      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
    </div>
  );
}
