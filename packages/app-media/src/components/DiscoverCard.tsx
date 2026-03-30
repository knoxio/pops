/**
 * DiscoverCard — poster card for a TMDB discovery result.
 * Displays poster, title, year, TMDB rating, and action buttons.
 */
import { useState } from "react";
import { cn, Badge, Button, Skeleton } from "@pops/ui";
import { Film, Plus, Bookmark, Check, Loader2, X, Eye } from "lucide-react";
import { RequestMovieButton } from "./RequestMovieButton";

export interface DiscoverCardProps {
  tmdbId: number;
  title: string;
  releaseDate: string;
  posterPath: string | null;
  posterUrl: string | null;
  voteAverage: number;
  inLibrary: boolean;
  isAddingToLibrary?: boolean;
  isAddingToWatchlist?: boolean;
  isMarkingWatched?: boolean;
  onAddToLibrary?: (tmdbId: number) => void;
  onAddToWatchlist?: (tmdbId: number) => void;
  onMarkWatched?: (tmdbId: number) => void;
  onNotInterested?: (tmdbId: number) => void;
  /** Match percentage (0–100) from preference profile scoring. */
  matchPercentage?: number;
  /** Brief explanation of match, e.g. "Action, Sci-Fi". */
  matchReason?: string;
  className?: string;
}

export function DiscoverCard({
  tmdbId,
  title,
  releaseDate,
  posterUrl: posterUrlProp,
  voteAverage,
  inLibrary,
  isAddingToLibrary,
  isAddingToWatchlist,
  onAddToLibrary,
  onAddToWatchlist,
  onMarkWatched,
  isMarkingWatched,
  onNotInterested,
  matchPercentage,
  matchReason,
  className,
}: DiscoverCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      const stored = localStorage.getItem("pops:dismissed-discover");
      if (!stored) return false;
      const ids = JSON.parse(stored) as number[];
      return ids.includes(tmdbId);
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const posterUrl = posterUrlProp;
  const showPlaceholder = !posterUrl || imageError;
  const year = releaseDate ? releaseDate.slice(0, 4) : null;

  return (
    <div className={cn("group flex w-36 shrink-0 flex-col gap-1.5 sm:w-40", className)}>
      {/* Poster */}
      <div className="relative w-full overflow-hidden rounded-md bg-muted aspect-[2/3]">
        {/* Rating badge */}
        {voteAverage > 0 && (
          <Badge variant="default" className="absolute top-2 left-2 z-10 text-xs">
            {voteAverage.toFixed(1)}
          </Badge>
        )}

        {/* In Library badge */}
        {inLibrary && (
          <Badge variant="secondary" className="absolute top-2 right-2 z-10 gap-0.5 text-xs">
            <Check className="h-3 w-3" />
            Owned
          </Badge>
        )}

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

        {!showPlaceholder && !imageLoaded && (
          <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
        )}

        {showPlaceholder && (
          <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
            <Film className="h-10 w-10 opacity-40" />
          </div>
        )}

        {/* Action overlay on hover */}
        <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-gradient-to-t from-black/80 to-transparent p-2 pt-8 opacity-0 transition-opacity group-hover:opacity-100">
          {!inLibrary && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-white hover:bg-white/20"
              onClick={() => onAddToLibrary?.(tmdbId)}
              disabled={isAddingToLibrary}
              title="Add to Library"
              aria-label="Add to Library"
            >
              {isAddingToLibrary ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-white hover:bg-white/20"
            onClick={() => onAddToWatchlist?.(tmdbId)}
            disabled={isAddingToWatchlist}
            title="Add to Watchlist"
            aria-label="Add to Watchlist"
          >
            {isAddingToWatchlist ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Bookmark className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-white hover:bg-white/20"
            onClick={() => onMarkWatched?.(tmdbId)}
            disabled={isMarkingWatched}
            title="Mark as Watched"
            aria-label="Mark as Watched"
          >
            {isMarkingWatched ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </Button>
          <RequestMovieButton tmdbId={tmdbId} title={title} variant="compact" />
          <Button
            size="icon"
            variant="ghost"
            className="ml-auto h-7 w-7 text-white hover:bg-white/20"
            onClick={() => {
              setDismissed(true);
              try {
                const stored = localStorage.getItem("pops:dismissed-discover");
                const ids: number[] = stored ? (JSON.parse(stored) as number[]) : [];
                if (!ids.includes(tmdbId)) {
                  ids.push(tmdbId);
                  localStorage.setItem("pops:dismissed-discover", JSON.stringify(ids));
                }
              } catch {
                // localStorage unavailable — dismiss still works for this session
              }
              onNotInterested?.(tmdbId);
            }}
            title="Not Interested"
            aria-label="Not Interested"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Title + Year + Match info */}
      <div className="space-y-0.5 px-0.5">
        <h3 className="text-sm font-medium leading-tight line-clamp-2">{title}</h3>
        {year && <p className="text-xs text-muted-foreground">{year}</p>}
        {matchPercentage != null && matchPercentage > 0 && (
          <div className="flex items-center gap-1">
            <span
              className={cn(
                "text-xs font-semibold",
                matchPercentage >= 85
                  ? "text-green-500"
                  : matchPercentage >= 70
                    ? "text-emerald-500"
                    : "text-muted-foreground"
              )}
            >
              {matchPercentage}% Match
            </span>
            {matchReason && (
              <span className="text-xs text-muted-foreground truncate">· {matchReason}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

DiscoverCard.displayName = "DiscoverCard";
