import { useParams, Link } from "react-router";
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
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@pops/ui";
import { trpc } from "../lib/trpc";
import { formatRuntime } from "../lib/format";

function TvShowDetailSkeleton() {
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
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TvShowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const showId = Number(id);

  const { data, isLoading, error } = trpc.media.tvShows.get.useQuery(
    { id: showId },
    { enabled: !Number.isNaN(showId) },
  );

  const {
    data: seasonsData,
    isLoading: seasonsLoading,
  } = trpc.media.tvShows.listSeasons.useQuery(
    { tvShowId: showId },
    { enabled: !Number.isNaN(showId) },
  );

  if (Number.isNaN(showId)) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Invalid show ID</AlertTitle>
          <AlertDescription>The show ID must be a number.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return <TvShowDetailSkeleton />;
  }

  if (error) {
    const is404 = error.data?.code === "NOT_FOUND";
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>{is404 ? "Show not found" : "Error"}</AlertTitle>
          <AlertDescription>
            {is404
              ? "This TV show doesn't exist in your library."
              : error.message}
          </AlertDescription>
        </Alert>
        <Link
          to="/media"
          className="mt-4 inline-block text-sm text-primary underline"
        >
          Back to library
        </Link>
      </div>
    );
  }

  const show = data?.data;
  if (!show) return null;

  const firstYear = show.firstAirDate
    ? new Date(show.firstAirDate).getFullYear()
    : null;
  const lastYear = show.lastAirDate
    ? new Date(show.lastAirDate).getFullYear()
    : null;

  const posterSrc = `/media/images/tv/${show.id}/poster.jpg`;
  const backdropSrc = show.backdropPath
    ? `/media/images/tv/${show.id}/backdrop.jpg`
    : null;
  const logoSrc = show.logoPath
    ? `/media/images/tv/${show.id}/logo.png`
    : null;

  const totalEpisodes = show.numberOfEpisodes ?? 0;

  const metadataItems = [
    { label: "Status", value: show.status },
    { label: "Language", value: show.originalLanguage?.toUpperCase() },
    {
      label: "Seasons",
      value: show.numberOfSeasons != null ? String(show.numberOfSeasons) : null,
    },
    {
      label: "Episodes",
      value: totalEpisodes > 0 ? String(totalEpisodes) : null,
    },
    {
      label: "Episode Runtime",
      value: show.episodeRunTime ? formatRuntime(show.episodeRunTime) : null,
    },
    {
      label: "Rating",
      value: show.voteAverage
        ? `${show.voteAverage.toFixed(1)} (${show.voteCount} votes)`
        : null,
    },
  ].filter((item) => item.value != null);

  const seasons = seasonsData?.data ?? [];
  const sortedSeasons = [...seasons].sort(
    (a, b) => a.seasonNumber - b.seasonNumber,
  );

  return (
    <div>
      {/* Breadcrumb */}
      <div className="p-6 pb-0">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/media">Media</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{show.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Hero section */}
      <div className="relative h-64 md:h-96 overflow-hidden bg-muted">
        {backdropSrc && (
          <img
            src={backdropSrc}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/20" />

        <div className="relative h-full flex flex-col md:flex-row items-end p-6 gap-4 md:gap-6">
          <img
            src={posterSrc}
            alt={`${show.name} poster`}
            className="w-28 md:w-44 aspect-[2/3] rounded-lg object-cover shadow-lg shrink-0"
          />

          <div className="flex-1 pb-1">
            <h1 className="text-2xl md:text-4xl font-bold text-foreground">
              {logoSrc ? (
                <>
                  <img
                    src={logoSrc}
                    alt={show.name}
                    className="h-12 md:h-16 object-contain"
                  />
                  <span className="sr-only">{show.name}</span>
                </>
              ) : (
                show.name
              )}
            </h1>

            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
              {firstYear && lastYear && firstYear !== lastYear && (
                <span>{firstYear}–{lastYear}</span>
              )}
              {firstYear && (!lastYear || firstYear === lastYear) && (
                <span>{firstYear}</span>
              )}
              {show.status && (
                <>
                  {firstYear && <span>·</span>}
                  <span>{show.status}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content below hero */}
      <div className="p-6 space-y-6 max-w-4xl">
        {/* Overview */}
        {show.overview && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Overview</h2>
            <p className="text-muted-foreground leading-relaxed">
              {show.overview}
            </p>
          </section>
        )}

        {/* Genre tags */}
        {show.genres.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Genres</h2>
            <div className="flex flex-wrap gap-2">
              {show.genres.map((genre) => (
                <Link
                  key={genre}
                  to={`/media?genre=${encodeURIComponent(genre)}`}
                >
                  <Badge
                    variant="secondary"
                    className="cursor-pointer hover:bg-secondary/80"
                  >
                    {genre}
                  </Badge>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Network tags */}
        {show.networks.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Networks</h2>
            <div className="flex flex-wrap gap-2">
              {show.networks.map((network) => (
                <Badge key={network} variant="outline">
                  {network}
                </Badge>
              ))}
            </div>
          </section>
        )}

        {/* Metadata grid */}
        {metadataItems.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Details</h2>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {metadataItems.map((item) => (
                <div key={item.label}>
                  <dt className="text-sm text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd className="text-sm font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* Progress placeholder */}
        {totalEpisodes > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Progress</h2>
            <p className="text-sm text-muted-foreground">
              0 / {totalEpisodes} episodes watched
            </p>
          </section>
        )}

        {/* Season list */}
        <section>
          <h2 className="text-lg font-semibold mb-3">
            Seasons{seasons.length > 0 && ` (${seasons.length})`}
          </h2>
          {seasonsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : sortedSeasons.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No season data available.
            </p>
          ) : (
            <div className="space-y-3">
              {sortedSeasons.map((season) => {
                const seasonLabel =
                  season.seasonNumber === 0
                    ? "Specials"
                    : `Season ${season.seasonNumber}`;
                const seasonPosterSrc = season.posterPath
                  ? `/media/images/tv/${show.id}/season-${season.seasonNumber}-poster.jpg`
                  : null;

                return (
                  <Link
                    key={season.id}
                    to={`/media/tv/${show.id}/season/${season.seasonNumber}`}
                    className="flex gap-4 rounded-lg border p-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {seasonPosterSrc ? (
                      <img
                        src={seasonPosterSrc}
                        alt={`${seasonLabel} poster`}
                        className="w-14 aspect-[2/3] rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-14 aspect-[2/3] rounded bg-muted shrink-0" />
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium">
                        {season.name ?? seasonLabel}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        {season.episodeCount != null && (
                          <span>{season.episodeCount} episodes</span>
                        )}
                        {season.episodeCount != null && season.airDate && (
                          <span>·</span>
                        )}
                        {season.airDate && <span>{season.airDate}</span>}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Back link */}
        <Link
          to="/media"
          className="inline-block text-sm text-primary underline"
        >
          Back to library
        </Link>
      </div>
    </div>
  );
}
