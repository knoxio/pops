import { Link } from 'react-router';

/**
 * SearchResultCard — displays a search result from TMDB or TheTVDB.
 * Shows poster from external CDN, title, year, overview, genres, rating,
 * and an "Add to Library" / "In Library" action.
 * When the item is already in the library (`inLibrary === true`) and has a
 * 'leaving' rotation status, a LeavingBadge is rendered to indicate the
 * removal countdown (PRD-072 US-01).
 */
import { cn } from '@pops/ui';

import { LeavingBadge } from './LeavingBadge';
import { MovieActionButtons } from './MovieActionButtons';
import {
  InLibraryActionButtons,
  NotInLibraryActionButtons,
} from './search-result-card/SearchResultActionButtons';
import { SearchResultGenres, SearchResultHeader } from './search-result-card/SearchResultMeta';
import { SearchResultPoster } from './search-result-card/SearchResultPoster';

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
  onAddToWatchlistAndLibrary?: () => void;
  isAddingToWatchlistAndLibrary?: boolean;
  onMarkWatchedAndLibrary?: () => void;
  isMarkingWatchedAndLibrary?: boolean;
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

function ActionRow(props: SearchResultCardProps) {
  const { inLibrary, type, rotationStatus, rotationExpiresAt, tmdbId, title, year, voteAverage } =
    props;
  return (
    <div className="relative z-10 mt-auto flex flex-wrap items-center gap-2 pt-1">
      {inLibrary ? <InLibraryActionButtons {...props} /> : <NotInLibraryActionButtons {...props} />}
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
  );
}

function CardBody(props: SearchResultCardProps) {
  const { type, title, year, overview, posterUrl, voteAverage, genres } = props;
  return (
    <>
      <SearchResultPoster type={type} posterUrl={posterUrl} title={title} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <SearchResultHeader title={title} year={year} voteAverage={voteAverage} type={type} />
        {overview && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{overview}</p>
        )}
        <SearchResultGenres genres={genres} />
        <ActionRow {...props} />
      </div>
    </>
  );
}

export function SearchResultCard(props: SearchResultCardProps) {
  const { type, title, href, className } = props;
  const baseClasses = cn(
    'relative flex gap-4 rounded-lg border bg-card p-3 text-card-foreground',
    href && 'transition-colors hover:bg-accent/50',
    className
  );

  return (
    <div className={baseClasses}>
      {href && (
        <Link
          to={href}
          className="absolute inset-0 rounded-lg"
          aria-label={`${title} (${type === 'movie' ? 'Movie' : 'TV'})`}
          tabIndex={-1}
        />
      )}
      <CardBody {...props} />
    </div>
  );
}
