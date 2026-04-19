import { Trophy } from 'lucide-react';
import { useState } from 'react';

import { trpc } from '@pops/api-client';
import { Alert, AlertDescription, AlertTitle } from '@pops/ui';

import { RankingRow } from './RankingRow';
import { RankingsSkeleton } from './RankingsSkeleton';

const PAGE_SIZE = 25;

interface RankingEntry {
  mediaType: string;
  mediaId: number;
  rank: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  score: number;
  comparisonCount: number;
  confidence: number;
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <Trophy className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
      <p className="text-muted-foreground">
        No rankings yet. Compare some movies to start building your leaderboard.
      </p>
    </div>
  );
}

function PaginationFooter({
  offset,
  total,
  hasMore,
  onPrev,
  onNext,
}: {
  offset: number;
  total: number;
  hasMore: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      <span className="text-sm text-muted-foreground">
        Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={offset === 0}
          className="text-sm text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasMore}
          className="text-sm text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function RankingsList({ dimensionId }: { dimensionId?: number }) {
  const [offset, setOffset] = useState(0);

  const { data, isLoading, error } = trpc.media.comparisons.rankings.useQuery({
    dimensionId,
    limit: PAGE_SIZE,
    offset,
  });

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load rankings.</AlertDescription>
      </Alert>
    );
  }
  if (isLoading) return <RankingsSkeleton />;

  const entries = (data?.data ?? []) as RankingEntry[];
  const pagination = data?.pagination;

  if (entries.length === 0 && offset === 0) return <EmptyState />;

  return (
    <div className="space-y-4">
      <div className="space-y-2" role="list" aria-label="Rankings">
        {entries.map((entry) => (
          <RankingRow
            key={`${entry.mediaType}-${entry.mediaId}`}
            rank={entry.rank}
            mediaType={entry.mediaType}
            mediaId={entry.mediaId}
            score={entry.score}
            comparisonCount={entry.comparisonCount}
            confidence={entry.confidence}
            title={entry.title}
            year={entry.year}
            posterUrl={entry.posterUrl}
          />
        ))}
      </div>
      {pagination && pagination.total > PAGE_SIZE && (
        <PaginationFooter
          offset={offset}
          total={pagination.total}
          hasMore={pagination.hasMore}
          onPrev={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          onNext={() => setOffset(offset + PAGE_SIZE)}
        />
      )}
    </div>
  );
}
