import { Badge } from "@pops/ui";
import { trpc } from "../lib/trpc";

type MediaType = "movie" | "tv";

export interface ArrStatusBadgeProps {
  mediaType: MediaType;
  /** TMDB ID for movies, TVDB ID for TV shows. */
  externalId: number;
  className?: string;
}

const STATUS_COLORS: Record<string, string> = {
  available: "bg-green-600 text-white hover:bg-green-600",
  complete: "bg-green-600 text-white hover:bg-green-600",
  downloading: "bg-yellow-600 text-white hover:bg-yellow-600",
  monitored: "bg-yellow-600 text-white hover:bg-yellow-600",
  partial: "bg-yellow-600 text-white hover:bg-yellow-600",
  unmonitored: "bg-muted text-muted-foreground hover:bg-muted",
  not_found: "bg-muted text-muted-foreground hover:bg-muted",
};

export function ArrStatusBadge({
  mediaType,
  externalId,
  className,
}: ArrStatusBadgeProps) {
  const { data: configData } = trpc.media.arr.getConfig.useQuery();

  const serviceConfigured =
    mediaType === "movie"
      ? configData?.data.radarrConfigured
      : configData?.data.sonarrConfigured;

  const movieStatus = trpc.media.arr.getMovieStatus.useQuery(
    { tmdbId: externalId },
    { enabled: mediaType === "movie" && serviceConfigured === true },
  );

  const showStatus = trpc.media.arr.getShowStatus.useQuery(
    { tvdbId: externalId },
    { enabled: mediaType === "tv" && serviceConfigured === true },
  );

  if (!serviceConfigured) return null;

  const result =
    mediaType === "movie" ? movieStatus.data?.data : showStatus.data?.data;

  if (!result || result.status === "not_found") return null;

  const colorClass = STATUS_COLORS[result.status] ?? "";

  return (
    <Badge className={`${colorClass} ${className ?? ""}`}>{result.label}</Badge>
  );
}
