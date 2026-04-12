/**
 * SearchResultCard — displays a search result from TMDB or TheTVDB.
 * Shows poster from external CDN, title, year, overview, genres, rating,
 * and an "Add to Library" / "In Library" action.
 */
import { Badge, Button, cn, Skeleton } from '@pops/ui';
import { Check, Film, Loader2, Plus, Tv } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { RequestMovieButton } from './RequestMovieButton';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';

export type SearchResultType = 'movie' | 'tv';

export interface SearchResultCardProps {
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
  addDisabled?: boolean;
  addDisabledReason?: string;
  isAdding?: boolean;
  onAdd?: () => void;
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
  addDisabled,
  addDisabledReason,
  isAdding,
  onAdd,
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
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
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

        {/* Action buttons */}
        <div className="mt-auto flex items-center gap-2 pt-1">
          {inLibrary ? (
            <Badge variant="secondary" className="gap-1">
              <Check className="h-3 w-3" />
              In Library
            </Badge>
          ) : (
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
              {isAdding ? 'Adding…' : 'Add to Library'}
            </Button>
          )}
          {type === 'movie' && tmdbId != null && (
            <RequestMovieButton
              tmdbId={tmdbId}
              title={title}
              year={year ? parseInt(year, 10) : new Date().getFullYear()}
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
