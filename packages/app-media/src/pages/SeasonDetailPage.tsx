import { useParams, Link } from "react-router";
import {
  Alert,
  AlertTitle,
  AlertDescription,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Skeleton,
} from "@pops/ui";
import { trpc } from "../lib/trpc";
import { EpisodeList } from "../components/EpisodeList";

function SeasonDetailSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-4 w-48" />
      <div className="flex gap-4">
        <Skeleton className="w-28 aspect-[2/3] rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export function SeasonDetailPage() {
  const { id, num } = useParams<{ id: string; num: string }>();
  const showId = Number(id);
  const seasonNum = Number(num);

  const {
    data: showData,
    isLoading: showLoading,
    error: showError,
  } = trpc.media.tvShows.get.useQuery(
    { id: showId },
    { enabled: !Number.isNaN(showId) }
  );

  const {
    data: seasonsData,
    isLoading: seasonsLoading,
  } = trpc.media.tvShows.listSeasons.useQuery(
    { tvShowId: showId },
    { enabled: !Number.isNaN(showId) }
  );

  const season = seasonsData?.data?.find((s) => s.seasonNumber === seasonNum);

  const {
    data: episodesData,
    isLoading: episodesLoading,
  } = trpc.media.tvShows.listEpisodes.useQuery(
    { seasonId: season?.id ?? 0 },
    { enabled: !!season?.id }
  );

  if (Number.isNaN(showId) || Number.isNaN(seasonNum)) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Invalid parameters</AlertTitle>
          <AlertDescription>Show ID and season number must be valid numbers.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (showLoading || seasonsLoading) {
    return <SeasonDetailSkeleton />;
  }

  if (showError) {
    const is404 = showError.data?.code === "NOT_FOUND";
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>{is404 ? "Show not found" : "Error"}</AlertTitle>
          <AlertDescription>
            {is404 ? "This TV show doesn't exist in your library." : showError.message}
          </AlertDescription>
        </Alert>
        <Link to="/media" className="mt-4 inline-block text-sm text-primary underline">
          Back to library
        </Link>
      </div>
    );
  }

  const show = showData?.data;
  if (!show) return null;

  if (!season) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Season not found</AlertTitle>
          <AlertDescription>
            Season {seasonNum} doesn't exist for {show.name}.
          </AlertDescription>
        </Alert>
        <Link
          to={`/media/tv/${show.id}`}
          className="mt-4 inline-block text-sm text-primary underline"
        >
          Back to {show.name}
        </Link>
      </div>
    );
  }

  const seasonLabel =
    seasonNum === 0 ? "Specials" : `Season ${seasonNum}`;
  const posterSrc = season.posterPath
    ? `/media/images/tv/${show.id}/season-${seasonNum}-poster.jpg`
    : null;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/media">Media</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={`/media/tv/${show.id}`}>{show.name}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{seasonLabel}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Season header */}
      <div className="flex flex-col sm:flex-row gap-4">
        {posterSrc && (
          <img
            src={posterSrc}
            alt={`${seasonLabel} poster`}
            className="w-28 aspect-[2/3] rounded-lg object-cover shadow-md shrink-0"
          />
        )}

        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {season.name ?? seasonLabel}
          </h1>

          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            {season.episodeCount != null && (
              <span>{season.episodeCount} episodes</span>
            )}
            {season.episodeCount != null && season.airDate && <span>·</span>}
            {season.airDate && <span>First aired {season.airDate}</span>}
          </div>

          {season.overview && (
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              {season.overview}
            </p>
          )}
        </div>
      </div>

      {/* Episode list */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Episodes</h2>
        {episodesLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <EpisodeList episodes={episodesData?.data ?? []} />
        )}
      </section>
    </div>
  );
}
