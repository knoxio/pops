import { Bookmark, Check, Eye, Film, Loader2, Plus, Tv } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

/**
 * SearchResultCard — displays a search result from TMDB or TheTVDB.
 * Shows poster from external CDN, title, year, overview, genres, rating,
 * and an "Add to Library" / "In Library" action.
 * When the item is already in the library (`inLibrary === true`) and has a
 * 'leaving' rotation status, a LeavingBadge is rendered to indicate the
 * removal countdown (PRD-072 US-01).
 *
 * For in-library items (mediaId provided): shows WatchlistToggle and (movies)
 * a Mark as Watched button inline.
 * For not-in-library items: shows compound "Add to Watchlist + Library" and
 * (movies) "Mark as Watched + Library" buttons alongside "Add to Library".
 *
 * When href is set the card becomes a clickable link. Buttons inside stop
 * click propagation so navigation only fires on background card clicks.
 */
import { Badge, Button, cn, Skeleton } from '@pops/ui';

import { LeavingBadge } from './LeavingBadge';
import { MovieActionButtons } from './MovieActionButtons';
import { WatchlistToggle } from './WatchlistToggle';

import type { RotationMeta } from '../lib/types';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';

export type SearchResultType = 'movie' | 'tv';

export interface SearchResultCardProps extends RotationMeta {
  type: SearchResultType;
  title: string;
  /** TMDB ID — required for movie request button. */
  tmdbId?: number;
  year?: string | null;
  overview?: string | null;
  posterUrl?: string | null;
  voteAverage?: number | null;
  genres?: string[];
  inLibrary?: boolean;
  /** Local library DB ID — enables watchlist/watched actions for in-library items. */
  mediaId?: number;
  addDisabled?: boolean;
  addDisabledReason?: string;
  isAdding?: boolean;
  onAdd?: () => void;
  /**
   * Compound action: add to library then add to watchlist.
   * Only shown for not-in-library items.
   */
  onAddToWatchlistAndLibrary?: () => void;
  isAddingToWatchlistAndLibrary?: boolean;
  /**
   * Compound action: add to library then mark as watched.
   * Only shown for not-in-library movie items.
   */
  onMarkWatchedAndLibrary?: () => void;
  isMarkingWatchedAndLibrary?: boolean;
  /**
   * Simple mark-as-watched for in-library movies.
   */
  onMarkWatched?: () => void;
  isMarkingWatched?: boolean;
  /** When set, the card becomes a clickable link to the detail page. */
  href?: string;
  className?: string;
}

/**
 * Build a full poster URL for search results.
 * TMDB returns relative paths (/abc.jpg), TheTVDB returns full URLs.
 */
export function buildPosterUrl(
  posterPath: string | null | undefined,
  type: SearchResultType
): string | null {
  if (!posterPath) return null;
  if (type === 'movie' && posterPath.startsWith('/')) {
    return `${TMDB_IMAGE_BASE}${posterPath}`;
  }
  return posterPath;
}

export function SearchResultCard({
  type,
  title,
  tmdbId,
  year,
  overview,
  posterUrl,
  voteAverage,
  genres,
  inLibrary,
  rotationStatus,
  rotationExpiresAt,
  mediaId,
  addDisabled,
  addDisabledReason,
  isAdding,
  onAdd,
  onAddToWatchlistAndLibrary,
  isAddingToWatchlistAndLibrary,
  onMarkWatchedAndLibrary,
  isMarkingWatchedAndLibrary,
  onMarkWatched,
  isMarkingWatched,
  href,
  className,
}: SearchResultCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const showPlaceholder = !posterUrl || imageError;
  const Icon = type === 'movie' ? Film : Tv;

  const cardContent = (
    <>
      {/* Poster */}
      <div className="relative w-20 shrink-0 overflow-hidden rounded-md bg-muted aspect-[2/3]">
        {!showPlaceholder && (
          <img
            src={posterUrl}
            alt={`${title} poster`}
            loading="lazy"
            className={cn('h-full w-full object-cover', imageLoaded ? 'opacity-100' : 'opacity-0')}
            onLoad={() => {
              setImageLoaded(true);
            }}
            onError={() => {
              setImageError(true);
            }}
          />
        )}
        {!showPlaceholder && !imageLoaded && (
          <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
        )}
        {showPlaceholder && (
          <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
            <Icon className="h-6 w-6 opacity-40" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-tight line-clamp-2">{title}</h3>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              {year && <span>{year}</span>}
              {voteAverage != null && voteAverage > 0 && (
                <>
                  {year && <span>·</span>}
                  <span>{voteAverage.toFixed(1)}</span>
                </>
              )}
            </div>
          </div>

          <Badge variant={type === 'movie' ? 'default' : 'secondary'} className="shrink-0">
            {type === 'movie' ? 'Movie' : 'TV'}
          </Badge>
        </div>

        {overview && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{overview}</p>
        )}

        {genres && genres.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {genres.slice(0, 3).map((genre) => (
              <Badge key={genre} variant="outline" className="text-2xs px-1.5 py-0">
                {genre}
              </Badge>
            ))}
          </div>
        )}

        {/* Action buttons — stop propagation so card link doesn't navigate on button click */}
        <div
          className="mt-auto flex flex-wrap items-center gap-2 pt-1"
          onClick={
            href
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }
              : undefined
          }
        >
          {inLibrary ? (
            <>
              <Badge variant="secondary" className="gap-1">
                <Check className="h-3 w-3" />
                In Library
              </Badge>
              {mediaId != null && (
                <WatchlistToggle mediaType={type} mediaId={mediaId} className="h-7 text-xs" />
              )}
              {type === 'movie' && mediaId != null && onMarkWatched != null && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  onClick={onMarkWatched}
                  disabled={isMarkingWatched}
                  aria-label="Mark as watched"
                >
                  {isMarkingWatched ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                  {isMarkingWatched ? 'Logging\u2026' : 'Mark Watched'}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                disabled={addDisabled || isAdding}
                title={addDisabledReason}
                onClick={onAdd}
              >
                {isAdding ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                {isAdding ? 'Adding\u2026' : 'Add to Library'}
              </Button>
              {onAddToWatchlistAndLibrary != null && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  onClick={onAddToWatchlistAndLibrary}
                  disabled={isAdding || isAddingToWatchlistAndLibrary}
                  aria-label="Add to watchlist and library"
                >
                  {isAddingToWatchlistAndLibrary ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Bookmark className="h-3 w-3" />
                  )}
                  {isAddingToWatchlistAndLibrary ? 'Adding\u2026' : 'Watchlist + Library'}
                </Button>
              )}
              {type === 'movie' && onMarkWatchedAndLibrary != null && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  onClick={onMarkWatchedAndLibrary}
                  disabled={isAdding || isMarkingWatchedAndLibrary}
                  aria-label="Mark as watched and add to library"
                >
                  {isMarkingWatchedAndLibrary ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                  {isMarkingWatchedAndLibrary ? 'Logging\u2026' : 'Watched + Library'}
                </Button>
              )}
            </>
          )}
          {inLibrary && rotationStatus === 'leaving' && rotationExpiresAt && (
            <LeavingBadge rotationExpiresAt={rotationExpiresAt} />
          )}
          {type === 'movie' && tmdbId != null && (
            <MovieActionButtons
              tmdbId={tmdbId}
              title={title}
              year={year ? parseInt(year, 10) : new Date().getFullYear()}
              rating={voteAverage ?? undefined}
            />
          )}
        </div>
      </div>
    </>
  );

  const baseClasses = cn(
    'flex gap-4 rounded-lg border bg-card p-3 text-card-foreground',
    href && 'transition-colors hover:bg-accent/50',
    className
  );

  if (href) {
    return (
      <Link
        to={href}
        className={baseClasses}
        aria-label={`${title} (${type === 'movie' ? 'Movie' : 'TV'})`}
      >
        {cardContent}
      </Link>
    );
  }

  return <div className={baseClasses}>{cardContent}</div>;
}
