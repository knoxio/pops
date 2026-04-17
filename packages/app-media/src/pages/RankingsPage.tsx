import { Trophy } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

/**
 * RankingsPage — leaderboard of media items ranked by Elo score.
 *
 * Supports per-dimension tabs (Overall + each active dimension).
 * Uses the comparisons.rankings tRPC query with pagination.
 */
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  cn,
  Skeleton,
  Tabs,
  TabsContent,
} from '@pops/ui';

import { trpc } from '../lib/trpc';

const PAGE_SIZE = 25;

function RankingsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3 rounded-lg border">
          <Skeleton className="h-5 w-8" />
          <Skeleton className="w-10 aspect-[2/3] rounded shrink-0" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

interface RankingRowProps {
  rank: number;
  mediaType: string;
  mediaId: number;
  score: number;
  comparisonCount: number;
  confidence: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
}

function RankingRow({
  rank,
  mediaType,
  mediaId,
  score,
  comparisonCount,
  confidence,
  title,
  year,
  posterUrl,
}: RankingRowProps) {
  const href = mediaType === 'movie' ? `/media/movies/${mediaId}` : `/media/tv/${mediaId}`;
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
      <span className="w-8 text-right text-sm font-bold text-muted-foreground tabular-nums">
        {rank <= 3 ? (
          <span
            className={
              rank === 1 ? 'text-warning' : rank === 2 ? 'text-zinc-400' : 'text-amber-700'
            }
          >
            #{rank}
          </span>
        ) : (
          `#${rank}`
        )}
      </span>

      <Link to={href} className="shrink-0">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={`${title} poster`}
            className="w-10 aspect-[2/3] rounded object-cover bg-muted"
            loading="lazy"
          />
        ) : (
          <div className="w-10 aspect-[2/3] rounded bg-muted" />
        )}
      </Link>

      <div className="flex-1 min-w-0">
        <Link to={href} className="hover:underline">
          <h3 className="text-sm font-medium truncate">{title}</h3>
        </Link>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge variant="secondary" className="text-xs">
            {mediaType === 'movie' ? 'Movie' : 'TV'}
          </Badge>
          {year && <span className="text-xs text-muted-foreground">{year}</span>}
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="text-sm font-semibold tabular-nums">{score}</div>
        <div className="text-xs text-muted-foreground">
          {comparisonCount} {comparisonCount === 1 ? 'match' : 'matches'}
        </div>
        {comparisonCount > 0 && (
          <div
            className={cn(
              'text-xs tabular-nums',
              confidence >= 0.7
                ? 'text-success'
                : confidence >= 0.4
                  ? 'text-warning'
                  : 'text-destructive'
            )}
          >
            {Math.round(confidence * 100)}% conf
          </div>
        )}
      </div>
    </div>
  );
}

function RankingsList({ dimensionId }: { dimensionId?: number }) {
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

  const entries = data?.data ?? [];
  const pagination = data?.pagination;

  if (entries.length === 0 && offset === 0) {
    return (
      <div className="text-center py-16">
        <Trophy className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground">
          No rankings yet. Compare some movies to start building your leaderboard.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2" role="list" aria-label="Rankings">
        {entries.map(
          (entry: {
            mediaType: string;
            mediaId: number;
            rank: number;
            title: string;
            year: number | null;
            posterUrl: string | null;
            score: number;
            comparisonCount: number;
            confidence: number;
          }) => (
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
          )
        )}
      </div>

      {pagination && pagination.total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, pagination.total)} of{' '}
            {pagination.total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOffset(Math.max(0, offset - PAGE_SIZE));
              }}
              disabled={offset === 0}
              className="text-sm text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => {
                setOffset(offset + PAGE_SIZE);
              }}
              disabled={!pagination.hasMore}
              className="text-sm text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RankingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const dimensionParam = searchParams.get('dimension') ?? 'overall';

  const { data: dimensionsData, isLoading: dimsLoading } =
    trpc.media.comparisons.listDimensions.useQuery();

  const activeDimensions = useMemo(
    () => (dimensionsData?.data ?? []).filter((d: { active: boolean }) => d.active),
    [dimensionsData?.data]
  );

  const showTabs = activeDimensions.length > 0;

  const handleTabChange = useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === 'overall') {
            next.delete('dimension');
          } else {
            next.set('dimension', value);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Trophy className="h-6 w-6 text-warning" />
        <h1 className="text-2xl font-bold">Rankings</h1>
      </div>

      {dimsLoading ? (
        <RankingsSkeleton />
      ) : showTabs ? (
        <Tabs value={dimensionParam} onValueChange={handleTabChange}>
          <div className="flex flex-wrap justify-center gap-2" role="tablist">
            {[
              { value: 'overall', label: 'Overall' },
              ...activeDimensions.map((dim: { id: number; name: string }) => ({
                value: String(dim.id),
                label: dim.name,
              })),
            ].map((chip) => (
              <button
                key={chip.value}
                role="tab"
                aria-selected={dimensionParam === chip.value}
                onClick={() => {
                  handleTabChange(chip.value);
                }}
                className={cn(
                  'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                  dimensionParam === chip.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <TabsContent value="overall" className="mt-4">
            <RankingsList />
          </TabsContent>

          {activeDimensions.map((dim: { id: number; name: string }) => (
            <TabsContent key={dim.id} value={String(dim.id)} className="mt-4">
              <RankingsList dimensionId={dim.id} />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <RankingsList />
      )}
    </div>
  );
}
