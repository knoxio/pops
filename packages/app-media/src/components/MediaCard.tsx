import { Film } from 'lucide-react';
import { Link } from 'react-router';

/**
 * MediaCard — poster card for a movie or TV show in the library grid.
 * Displays poster image, title (2-line truncate), year, and optional type badge.
 * Implements a 3-tier image fallback: posterUrl → fallbackPosterUrl → placeholder SVG.
 */
import { Badge, cn, Skeleton } from '@pops/ui';

import { usePosterCascade } from '../hooks/usePosterCascade';

export type MediaType = 'movie' | 'tv';

export interface MediaCardProps {
  /** Local database ID. */
  id: number;
  /** Media type — determines badge label and navigation path. */
  type: MediaType;
  /** Display title. */
  title: string;
  /** Release year (movies) or first air year (TV). */
  year?: string | number | null;
  /** Primary poster image URL (e.g. user override). When null, skips to fallback. */
  posterUrl?: string | null;
  /** Fallback poster URL (e.g. cached API poster). Tried when posterUrl fails to load. */
  fallbackPosterUrl?: string | null;
  /** Watch progress for TV shows (0–100 percentage). */
  progress?: number | null;
  /** Whether to show the type badge overlay. Defaults to true. */
  showTypeBadge?: boolean;
  /** Additional CSS classes for the root element. */
  className?: string;
}

const TYPE_LABELS: Record<MediaType, string> = {
  movie: 'Movie',
  tv: 'TV',
};

function buildHref(type: MediaType, id: number): string {
  return type === 'movie' ? `/media/movies/${id}` : `/media/tv/${id}`;
}

function PosterImage({
  activeSrc,
  title,
  imageLoaded,
  setImageLoaded,
  handleImageError,
}: {
  activeSrc: string;
  title: string;
  imageLoaded: boolean;
  setImageLoaded: (v: boolean) => void;
  handleImageError: () => void;
}) {
  return (
    <>
      <img
        src={activeSrc}
        alt={`${title} poster`}
        loading="lazy"
        className={cn(
          'h-full w-full object-cover transition-opacity duration-200',
          'group-hover:opacity-80',
          imageLoaded ? 'opacity-100' : 'opacity-0'
        )}
        onLoad={() => {
          setImageLoaded(true);
        }}
        onError={handleImageError}
      />
      {!imageLoaded && <Skeleton className="absolute inset-0 h-full w-full rounded-none" />}
    </>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted/50">
      <div
        className={cn('h-full transition-all', progress >= 100 ? 'bg-success' : 'bg-primary')}
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </div>
  );
}

export function MediaCard({
  id,
  type,
  title,
  year,
  posterUrl,
  fallbackPosterUrl,
  progress,
  showTypeBadge = true,
  className,
}: MediaCardProps) {
  const cascade = usePosterCascade(posterUrl, fallbackPosterUrl);

  return (
    <Link
      to={buildHref(type, id)}
      aria-label={`${title} (${TYPE_LABELS[type]})`}
      className={cn(
        'group block w-full text-left outline-none',
        'rounded-lg focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      <div className="relative w-full overflow-hidden rounded-md bg-muted aspect-[2/3]">
        {showTypeBadge && (
          <Badge
            variant={type === 'movie' ? 'default' : 'secondary'}
            className="absolute top-2 left-2 z-10"
          >
            {TYPE_LABELS[type]}
          </Badge>
        )}

        {cascade.activeSrc && !cascade.showPlaceholder && (
          <PosterImage
            activeSrc={cascade.activeSrc}
            title={title}
            imageLoaded={cascade.imageLoaded}
            setImageLoaded={cascade.setImageLoaded}
            handleImageError={cascade.handleImageError}
          />
        )}

        {cascade.showPlaceholder && (
          <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
            <Film className="h-10 w-10 opacity-40" />
          </div>
        )}

        {progress != null && progress > 0 && <ProgressBar progress={progress} />}
      </div>

      <div className="mt-2 space-y-0.5 px-0.5">
        <h3 className="text-sm font-medium leading-tight line-clamp-2">{title}</h3>
        {year && (
          <p className="text-xs text-muted-foreground">
            {typeof year === 'string' ? year.slice(0, 4) : year}
          </p>
        )}
      </div>
    </Link>
  );
}

MediaCard.displayName = 'MediaCard';
