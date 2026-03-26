/**
 * MediaCard — poster card for a movie or TV show in the library grid.
 * Displays poster image, title (2-line truncate), year, and type badge.
 */
import { useState } from "react";
import { cn, Badge, Skeleton } from "@pops/ui";
import { Film } from "lucide-react";

export type MediaType = "movie" | "tv";

export interface MediaCardProps {
  /** Local database ID. */
  id: number;
  /** Media type — determines badge label and navigation path. */
  type: MediaType;
  /** Display title. */
  title: string;
  /** Release year (movies) or first air year (TV). */
  year?: string | number | null;
  /** Poster image URL from local cache. When null, shows placeholder. */
  posterUrl?: string | null;
  /** Watch progress for TV shows (0–100 percentage). */
  progress?: number | null;
  /** Click handler — typically navigates to detail page. */
  onClick?: (id: number, type: MediaType) => void;
  /** Additional CSS classes for the root element. */
  className?: string;
}

const TYPE_LABELS: Record<MediaType, string> = {
  movie: "Movie",
  tv: "TV",
};

export function MediaCard({
  id,
  type,
  title,
  year,
  posterUrl,
  progress,
  onClick,
  className,
}: MediaCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const handleClick = () => {
    onClick?.(id, type);
  };

  const showPlaceholder = !posterUrl || imageError;

  return (
    <button
      type="button"
      aria-label={`${title} (${TYPE_LABELS[type]})`}
      className={cn(
        "group flex w-full cursor-pointer flex-col gap-2 text-left",
        "rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      onClick={handleClick}
    >
      {/* Poster container with 2:3 aspect ratio */}
      <div className="relative w-full overflow-hidden rounded-md bg-muted aspect-[2/3]">
        {/* Type badge */}
        <Badge
          variant={type === "movie" ? "default" : "secondary"}
          className="absolute top-2 left-2 z-10"
        >
          {TYPE_LABELS[type]}
        </Badge>

        {/* Poster image */}
        {!showPlaceholder && (
          <img
            src={posterUrl}
            alt={`${title} poster`}
            loading="lazy"
            className={cn(
              "h-full w-full object-cover transition-opacity duration-200",
              "group-hover:opacity-80",
              imageLoaded ? "opacity-100" : "opacity-0"
            )}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        )}

        {/* Loading skeleton — shown while image loads */}
        {!showPlaceholder && !imageLoaded && (
          <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
        )}

        {/* No-poster placeholder */}
        {showPlaceholder && (
          <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
            <Film className="h-10 w-10 opacity-40" />
          </div>
        )}

        {/* Progress bar for TV shows */}
        {progress != null && progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted/50">
            <div
              className={cn(
                "h-full transition-all",
                progress >= 100 ? "bg-green-500" : "bg-primary"
              )}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Title + Year */}
      <div className="space-y-0.5 px-0.5">
        <h3 className="text-sm font-medium leading-tight line-clamp-2">{title}</h3>
        {year && (
          <p className="text-xs text-muted-foreground">
            {typeof year === "string" ? year.slice(0, 4) : year}
          </p>
        )}
      </div>
    </button>
  );
}

MediaCard.displayName = "MediaCard";
