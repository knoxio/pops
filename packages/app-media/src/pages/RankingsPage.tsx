/**
 * RankingsPage — leaderboard of media items ranked by Elo score.
 *
 * Supports per-dimension tabs (Overall + each active dimension).
 * Uses the comparisons.rankings tRPC query with pagination.
 */
import { useState, useMemo } from "react";
import { Link } from "react-router";
import {
  Alert,
  AlertTitle,
  AlertDescription,
  Badge,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@pops/ui";
import { Trophy } from "lucide-react";
import { trpc } from "../lib/trpc";

const PAGE_SIZE = 50;

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
  title,
  year,
  posterUrl,
}: RankingRowProps) {
  const href = mediaType === "movie" ? `/media/movies/${mediaId}` : `/media/tv/${mediaId}`;
  const posterSrc = posterUrl ?? "";

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
      <span className="w-8 text-right text-sm font-bold text-muted-foreground tabular-nums">
        {rank <= 3 ? (
          <span
            className={
              rank === 1 ? "text-yellow-500" : rank === 2 ? "text-zinc-400" : "text-amber-700"
            }
          >
            #{rank}
          </span>
        ) : (
          `#${rank}`
        )}
      </span>

      <Link to={href} className="shrink-0">
        <img
          src={posterSrc}
          alt={`${title} poster`}
          className="w-10 aspect-[2/3] rounded object-cover bg-muted"
          loading="lazy"
        />
      </Link>

      <div className="flex-1 min-w-0">
        <Link to={href} className="hover:underline">
          <h3 className="text-sm font-medium truncate">{title}</h3>
        </Link>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge variant="secondary" className="text-xs">
            {mediaType === "movie" ? "Movie" : "TV"}
          </Badge>
          {year && <span className="text-xs text-muted-foreground">{year}</span>}
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="text-sm font-semibold tabular-nums">{score}</div>
        <div className="text-xs text-muted-foreground">
          {comparisonCount} {comparisonCount === 1 ? "match" : "matches"}
        </div>
      </div>
    </div>
  );
}

interface MediaMeta {
  title: string;
  year: number | null;
  posterUrl: string | null;
}

function RankingsList({ dimensionId }: { dimensionId?: number }) {
  const [offset, setOffset] = useState(0);

  const { data, isLoading, error } = trpc.media.comparisons.rankings.useQuery({
    dimensionId,
    limit: PAGE_SIZE,
    offset,
  });

  const { data: moviesData } = trpc.media.movies.list.useQuery({ limit: 500 });
  const { data: tvShowsData } = trpc.media.tvShows.list.useQuery({
    limit: 500,
  });

  const movieMap = useMemo(
    () =>
      new Map<number, MediaMeta>(
        (moviesData?.data ?? []).map(
          (m: {
            id: number;
            title: string;
            releaseDate: string | null;
            posterUrl: string | null;
          }) => [
            m.id,
            {
              title: m.title,
              year: m.releaseDate ? new Date(m.releaseDate).getFullYear() : null,
              posterUrl: m.posterUrl,
            },
          ]
        )
      ),
    [moviesData?.data]
  );

  const tvMap = useMemo(
    () =>
      new Map<number, MediaMeta>(
        (tvShowsData?.data ?? []).map(
          (s: {
            id: number;
            name: string;
            firstAirDate: string | null;
            posterUrl: string | null;
          }) => [
            s.id,
            {
              title: s.name,
              year: s.firstAirDate ? new Date(s.firstAirDate).getFullYear() : null,
              posterUrl: s.posterUrl,
            },
          ]
        )
      ),
    [tvShowsData?.data]
  );

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
        {entries.map((entry) => {
          const meta =
            entry.mediaType === "movie" ? movieMap.get(entry.mediaId) : tvMap.get(entry.mediaId);

          return (
            <RankingRow
              key={`${entry.mediaType}-${entry.mediaId}`}
              rank={entry.rank}
              mediaType={entry.mediaType}
              mediaId={entry.mediaId}
              score={entry.score}
              comparisonCount={entry.comparisonCount}
              title={meta?.title ?? "Unknown"}
              year={meta?.year ?? null}
              posterUrl={meta?.posterUrl ?? null}
            />
          );
        })}
      </div>

      {pagination && pagination.total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, pagination.total)} of{" "}
            {pagination.total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="text-sm text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setOffset(offset + PAGE_SIZE)}
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
  const { data: dimensionsData, isLoading: dimsLoading } =
    trpc.media.comparisons.listDimensions.useQuery();

  const activeDimensions = useMemo(
    () => (dimensionsData?.data ?? []).filter((d) => d.active),
    [dimensionsData?.data]
  );

  const showTabs = activeDimensions.length > 0;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Trophy className="h-6 w-6 text-yellow-500" />
        <h1 className="text-2xl font-bold">Rankings</h1>
      </div>

      {dimsLoading ? (
        <RankingsSkeleton />
      ) : showTabs ? (
        <Tabs defaultValue="overall">
          <TabsList>
            <TabsTrigger value="overall">Overall</TabsTrigger>
            {activeDimensions.map((dim) => (
              <TabsTrigger key={dim.id} value={String(dim.id)}>
                {dim.name}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overall" className="mt-4">
            <RankingsList />
          </TabsContent>

          {activeDimensions.map((dim) => (
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
