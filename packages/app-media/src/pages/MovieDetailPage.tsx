import { useParams, Link } from "react-router";
import { useSetPageContext } from "@pops/navigation";
import {
  Alert,
  AlertTitle,
  AlertDescription,
  Badge,
  Skeleton,
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@pops/ui";
import { trpc } from "../lib/trpc";
import { formatCurrency, formatLanguage, formatRuntime } from "../lib/format";
import { Button } from "@pops/ui";
import { WatchlistToggle } from "../components/WatchlistToggle";
import { ComparisonScores } from "../components/ComparisonScores";
import { MarkAsWatchedButton } from "../components/MarkAsWatchedButton";
import { ArrStatusBadge } from "../components/ArrStatusBadge";
import { RequestMovieButton } from "../components/RequestMovieButton";
import { FreshnessBadge } from "../components/FreshnessBadge";
import { ExcludedDimensions } from "../components/ExcludedDimensions";

function MovieDetailSkeleton() {
  return (
    <div>
      <div className="relative h-64 md:h-96 bg-muted">
        <div className="absolute inset-0 flex items-end p-6 gap-6">
          <Skeleton className="w-32 md:w-48 aspect-[2/3] rounded-lg shrink-0" />
          <div className="flex-1 space-y-3 pb-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>
      <div className="p-6 space-y-6">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-16" />
        </div>
      </div>
    </div>
  );
}

export function MovieDetailPage() {
  const { id } = useParams<{ id: string }>();
  const movieId = Number(id);

  const { data, isLoading, error } = trpc.media.movies.get.useQuery(
    { id: movieId },
    { enabled: !Number.isNaN(movieId) }
  );

  const { data: watchHistoryData } = trpc.media.watchHistory.list.useQuery(
    { mediaType: "movie", mediaId: movieId },
    { enabled: !Number.isNaN(movieId) }
  );

  const { data: stalenessData } = trpc.media.comparisons.getStaleness.useQuery(
    { mediaType: "movie", mediaId: movieId },
    { enabled: !Number.isNaN(movieId) }
  );

  const { data: pendingDebriefData } = trpc.media.comparisons.getPendingDebriefs.useQuery(
    undefined,
    { enabled: !Number.isNaN(movieId) }
  );

  useSetPageContext({
    page: "movie-detail",
    pageType: "drill-down",
    entity: {
      uri: `pops:media/movie/${movieId}`,
      type: "movie",
      title: data?.data?.title ?? "",
    },
  });

  if (Number.isNaN(movieId)) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Invalid movie ID</AlertTitle>
          <AlertDescription>The movie ID must be a number.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return <MovieDetailSkeleton />;
  }

  if (error) {
    const is404 = error.data?.code === "NOT_FOUND";
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>{is404 ? "Movie not found" : "Error"}</AlertTitle>
          <AlertDescription>
            {is404 ? "This movie doesn't exist in your library." : error.message}
          </AlertDescription>
        </Alert>
        <Link to="/media" className="mt-4 inline-block text-sm text-primary underline">
          Back to library
        </Link>
      </div>
    );
  }

  const movie = data?.data;
  if (!movie) return null;

  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : null;

  const posterSrc = movie.posterUrl ?? undefined;
  const backdropSrc = movie.backdropUrl ?? undefined;
  const logoSrc = movie.logoUrl ?? undefined;

  const watchEntries = watchHistoryData?.data ?? [];
  const mostRecentWatch =
    watchEntries.length > 0
      ? watchEntries.reduce((latest, entry) =>
          new Date(entry.watchedAt) > new Date(latest.watchedAt) ? entry : latest
        )
      : null;
  const daysSinceWatch = mostRecentWatch
    ? Math.floor(
        (Date.now() - new Date(mostRecentWatch.watchedAt).getTime()) / (1000 * 60 * 60 * 24)
      )
    : null;
  const staleness = stalenessData?.data?.staleness ?? 1.0;

  const pendingDebrief = (pendingDebriefData?.data ?? []).find(
    (d: { movieId: number; status: string }) =>
      d.movieId === movie.id && (d.status === "pending" || d.status === "active")
  );

  const metadataItems = [
    { label: "Status", value: movie.status },
    {
      label: "Language",
      value: movie.originalLanguage ? formatLanguage(movie.originalLanguage) : null,
    },
    {
      label: "Budget",
      value: movie.budget ? formatCurrency(movie.budget) : null,
    },
    {
      label: "Revenue",
      value: movie.revenue ? formatCurrency(movie.revenue) : null,
    },
    {
      label: "TMDB Rating",
      value: movie.voteAverage
        ? `${movie.voteAverage.toFixed(1)} (${movie.voteCount} votes)`
        : null,
    },
    {
      label: "Runtime",
      value: movie.runtime ? formatRuntime(movie.runtime) : null,
    },
  ].filter((item) => item.value != null);

  return (
    <div>
      {/* Hero section — negative margins cancel shell padding for edge-to-edge */}
      <div className="-mx-4 md:-mx-6 lg:-mx-8 -mt-4 md:-mt-6 lg:-mt-8 relative h-64 md:h-96 overflow-hidden bg-muted">
        {backdropSrc && (
          <img src={backdropSrc} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/20" />

        {/* Breadcrumb overlay */}
        <div className="absolute top-0 left-0 right-0 p-4 md:p-6 z-10">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/media" className="text-white/70 hover:text-white">
                    Media
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="text-white/50" />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-white/90">{movie.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="relative h-full flex flex-col md:flex-row items-end p-6 gap-4 md:gap-6">
          {posterSrc ? (
            <img
              src={posterSrc}
              alt={`${movie.title} poster`}
              className="w-28 md:w-44 aspect-[2/3] rounded-lg object-cover shadow-lg shrink-0"
            />
          ) : (
            <div className="w-28 md:w-44 aspect-[2/3] rounded-lg bg-muted shadow-lg shrink-0" />
          )}

          <div className="flex-1 pb-1">
            <h1 className="text-2xl md:text-4xl font-bold text-foreground">
              {logoSrc ? (
                <>
                  <img src={logoSrc} alt={movie.title} className="h-12 md:h-16 object-contain" />
                  <span className="sr-only">{movie.title}</span>
                </>
              ) : (
                movie.title
              )}
            </h1>

            {movie.tagline && (
              <p className="text-sm md:text-base text-muted-foreground italic mt-1">
                {movie.tagline}
              </p>
            )}

            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
              {year && <span>{year}</span>}
              {year && movie.runtime && <span>·</span>}
              {movie.runtime && <span>{formatRuntime(movie.runtime)}</span>}
            </div>

            <div className="flex items-start gap-3 mt-3">
              <WatchlistToggle mediaType="movie" mediaId={movie.id} />
              <MarkAsWatchedButton mediaId={movie.id} />
              <ArrStatusBadge kind="movie" externalId={movie.tmdbId} />
              <RequestMovieButton
                tmdbId={movie.tmdbId}
                title={movie.title}
                year={year ?? new Date().getFullYear()}
              />
              <FreshnessBadge daysSinceWatch={daysSinceWatch} staleness={staleness} />
              {pendingDebrief && (
                <Link to={`/media/debrief/${movie.id}`}>
                  <Button variant="outline" size="sm">
                    Debrief this movie
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content below hero */}
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Overview */}
        {movie.overview && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Overview</h2>
            <p className="text-muted-foreground leading-relaxed">{movie.overview}</p>
          </section>
        )}

        {/* Genre tags */}
        {movie.genres.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Genres</h2>
            <div className="flex flex-wrap gap-2">
              {movie.genres.map((genre: string) => (
                <Link key={genre} to={`/media?genre=${encodeURIComponent(genre)}`}>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                    {genre}
                  </Badge>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Comparison scores radar chart */}
        <ComparisonScores mediaType="movie" mediaId={movie.id} />

        {/* Excluded dimensions (hidden when none excluded) */}
        <ExcludedDimensions mediaType="movie" mediaId={movie.id} />

        {/* Metadata grid */}
        {metadataItems.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Details</h2>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {metadataItems.map((item) => (
                <div key={item.label}>
                  <dt className="text-sm text-muted-foreground">{item.label}</dt>
                  <dd className="text-sm font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* Watch history */}
        <section>
          <h2 className="text-lg font-semibold mb-2">Watch History</h2>
          {watchHistoryData?.data && watchHistoryData.data.length > 0 ? (
            <ul className="space-y-2">
              {[...watchHistoryData.data]
                .sort((a, b) => new Date(a.watchedAt).getTime() - new Date(b.watchedAt).getTime())
                .map((entry) => (
                  <li key={entry.id} className="text-sm text-muted-foreground">
                    {new Date(entry.watchedAt).toLocaleDateString("en-AU", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Not watched yet</p>
          )}
        </section>
      </div>
    </div>
  );
}
