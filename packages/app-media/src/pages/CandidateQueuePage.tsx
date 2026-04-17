/**
 * CandidateQueuePage — tabbed view of rotation candidate queue.
 *
 * PRD-072 US-04
 */
import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@pops/ui';
import {
  ArrowLeft,
  Ban,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  Search,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '../lib/trpc';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;
const TMDB_IMG = 'https://image.tmdb.org/t/p/w185';

// ---------------------------------------------------------------------------
// Candidate card
// ---------------------------------------------------------------------------

interface CandidateCardProps {
  candidate: {
    id: number;
    tmdbId: number;
    title: string;
    year: number | null;
    rating: number | null;
    posterPath: string | null;
    discoveredAt: string;
    sourceName: string | null;
    sourcePriority: number | null;
  };
  actions?: 'pending' | 'excluded' | 'none';
}

function CandidateCard({ candidate, actions = 'none' }: CandidateCardProps) {
  const utils = trpc.useUtils();
  const [excludeReason, setExcludeReason] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);

  const downloadMutation = trpc.media.rotation.downloadCandidate.useMutation({
    onSuccess: () => {
      toast.success(`Downloading "${candidate.title}"`);
      void utils.media.rotation.listCandidates.invalidate();
    },
    onError: (err) => toast.error(err.message || 'Failed to download'),
  });

  const excludeMutation = trpc.media.rotation.excludeCandidate.useMutation({
    onSuccess: () => {
      toast.success(`Excluded "${candidate.title}"`);
      void utils.media.rotation.listCandidates.invalidate();
      void utils.media.rotation.listExclusions.invalidate();
      setPopoverOpen(false);
    },
    onError: (err) => toast.error(err.message || 'Failed to exclude'),
  });

  const unexcludeMutation = trpc.media.rotation.removeExclusion.useMutation({
    onSuccess: () => {
      toast.success(`Restored "${candidate.title}" to queue`);
      void utils.media.rotation.listCandidates.invalidate();
      void utils.media.rotation.listExclusions.invalidate();
    },
    onError: (err) => toast.error(err.message || 'Failed to restore'),
  });

  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      <div className="h-18 w-12 shrink-0 overflow-hidden rounded bg-muted">
        {candidate.posterPath ? (
          <img
            src={`${TMDB_IMG}${candidate.posterPath}`}
            alt={candidate.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            N/A
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{candidate.title}</span>
          {candidate.year && (
            <span className="text-xs text-muted-foreground">({candidate.year})</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          {candidate.rating != null && (
            <span className="text-warning">{candidate.rating.toFixed(1)}</span>
          )}
          {candidate.sourceName && <span>{candidate.sourceName}</span>}
          {candidate.sourcePriority != null && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              P{candidate.sourcePriority}
            </Badge>
          )}
          <span>{new Date(candidate.discoveredAt).toLocaleDateString()}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {actions === 'pending' && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadMutation.mutate({ candidateId: candidate.id })}
              disabled={downloadMutation.isPending}
              title="Download via Radarr"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>

            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={excludeMutation.isPending}
                  title="Exclude"
                >
                  <Ban className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 space-y-2" align="end">
                <p className="text-sm font-medium">Exclude this movie?</p>
                <input
                  className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                  placeholder="Reason (optional)"
                  value={excludeReason}
                  onChange={(e) => setExcludeReason(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={() =>
                    excludeMutation.mutate({
                      tmdbId: candidate.tmdbId,
                      title: candidate.title,
                      reason: excludeReason || undefined,
                    })
                  }
                  disabled={excludeMutation.isPending}
                >
                  Confirm
                </Button>
              </PopoverContent>
            </Popover>
          </>
        )}

        {actions === 'excluded' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => unexcludeMutation.mutate({ tmdbId: candidate.tmdbId })}
            disabled={unexcludeMutation.isPending}
            title="Restore to queue"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab content with pagination and search
// ---------------------------------------------------------------------------

interface CandidateListProps {
  status: 'pending' | 'added' | 'excluded';
  actions: 'pending' | 'excluded' | 'none';
}

function CandidateList({ status, actions }: CandidateListProps) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const query = trpc.media.rotation.listCandidates.useQuery({
    status,
    search: search || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            className="flex h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Search by title..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-22 w-full rounded-md" />
          ))}
        </div>
      ) : !query.data?.items.length ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No candidates found</p>
      ) : (
        <>
          <div className="space-y-2">
            {query.data.items.map((c) => (
              <CandidateCard key={c.id} candidate={c} actions={actions} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                {query.data.total} total &middot; page {page + 1} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exclusion list tab
// ---------------------------------------------------------------------------

function ExclusionList() {
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
          <div key={e.id} className="flex items-center gap-3 rounded-md border p-3">
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
              onClick={() => unexcludeMutation.mutate({ tmdbId: e.tmdbId })}
              disabled={unexcludeMutation.isPending}
              title="Restore to queue"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-muted-foreground">
            {query.data.total} total &middot; page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function CandidateQueuePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'pending';

  const pendingCount = trpc.media.rotation.listCandidates.useQuery({ status: 'pending', limit: 1 });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link to="/media/rotation">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Candidate Queue</h1>
          <p className="text-sm text-muted-foreground">Browse and manage rotation candidates</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending
            {pendingCount.data?.total ? (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                {pendingCount.data.total}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="added">Added</TabsTrigger>
          <TabsTrigger value="excluded">Excluded</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <CandidateList status="pending" actions="pending" />
        </TabsContent>

        <TabsContent value="added">
          <CandidateList status="added" actions="none" />
        </TabsContent>

        <TabsContent value="excluded">
          <ExclusionList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
