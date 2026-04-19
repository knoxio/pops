import { Film, Tv } from 'lucide-react';
import { useState } from 'react';

import { cn, Skeleton } from '@pops/ui';

import type { SearchResultType } from '../SearchResultCard';

export function SearchResultPoster({
  type,
  posterUrl,
  title,
}: {
  type: SearchResultType;
  posterUrl?: string | null;
  title: string;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const showPlaceholder = !posterUrl || imageError;
  const Icon = type === 'movie' ? Film : Tv;

  return (
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
  );
}
