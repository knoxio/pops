/**
 * MediaCard — poster card for a movie or TV show in the library grid.
 * Displays poster image, title (2-line truncate), year, and type badge.
 */
import { useState, type MouseEvent } from "react";
import { cn, Skeleton } from "@pops/ui";

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
  onClick,
  className,
}: MediaCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    onClick?.(id, type);
  };

  const showPlaceholder = !posterUrl || imageError;

  return (
    <button
      type="button"
      className={cn(
        "group flex w-full cursor-pointer flex-col gap-2 text-left",
        "rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      onClick={handleClick}
    >
      {/* Poster container with 2:3 aspect ratio */}
      <div className="relative w-full overflow-hidden rounded-md bg-muted aspect-[2/3]">
        {/* Type badge */}
        <span
          className={cn(
            "absolute top-2 left-2 z-10 rounded px-1.5 py-0.5 text-xs font-semibold",
            type === "movie"
              ? "bg-primary text-primary-foreground"
              : "bg-info text-white",
          )}
        >
          {TYPE_LABELS[type]}
        </span>

        {/* Poster image */}
        {!showPlaceholder && (
          <img
            src={posterUrl}
            alt={`${title} poster`}
            loading="lazy"
            className={cn(
              "h-full w-full object-cover transition-opacity duration-200",
              "group-hover:opacity-80",
              imageLoaded ? "opacity-100" : "opacity-0",
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-10 w-10 opacity-40"
            >
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
              <line x1="7" y1="2" x2="7" y2="22" />
              <line x1="17" y1="2" x2="17" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <line x1="2" y1="7" x2="7" y2="7" />
              <line x1="2" y1="17" x2="7" y2="17" />
              <line x1="17" y1="7" x2="22" y2="7" />
              <line x1="17" y1="17" x2="22" y2="17" />
            </svg>
          </div>
        )}
      </div>

      {/* Title + Year */}
      <div className="space-y-0.5 px-0.5">
        <h3 className="text-sm font-medium leading-tight line-clamp-2">
          {title}
        </h3>
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
