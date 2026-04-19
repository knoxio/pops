import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import { Button, Skeleton } from '@pops/ui';

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
  const utils = trpc.useUtils();

  const query = trpc.media.rotation.listExclusions.useQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const unexcludeMutation = trpc.media.rotation.removeExclusion.useMutation({
    onSuccess: () => {
      toast.success('Exclusion removed');
      void utils.media.rotation.listExclusions.invalidate();
      void utils.media.rotation.listCandidates.invalidate();
    },
    onError: (err) => toast.error(err.message || 'Failed to remove exclusion'),
  });

  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE_SIZE));

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (!query.data?.items.length) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No exclusions</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {query.data.items.map((e) => (
          <ExclusionRow
            key={e.id}
            e={e}
            onRestore={(tmdbId) => unexcludeMutation.mutate({ tmdbId })}
            isPending={unexcludeMutation.isPending}
          />
        ))}
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        total={query.data.total}
        onPageChange={setPage}
      />
    </div>
  );
}
