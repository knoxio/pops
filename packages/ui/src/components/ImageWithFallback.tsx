/**
 * ImageWithFallback — image that shows a skeleton while loading, a fallback
 * source on error, and a placeholder icon when no source is available.
 */
import { type ComponentType, useEffect, useState } from 'react';

import { cn } from '../lib/utils';
import { Skeleton } from '../primitives/skeleton';

export interface ImageWithFallbackProps {
  src?: string | null;
  /** Secondary source used when `src` fails to load. */
  fallbackSrc?: string | null;
  alt: string;
  /** Icon shown when no src resolves. */
  placeholderIcon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** Tailwind aspect-ratio utility e.g. `aspect-[2/3]`. */
  aspectRatio?: string;
  /** Object-fit mode. Default `cover`. */
  fit?: 'cover' | 'contain';
  className?: string;
  imgClassName?: string;
  /** Set to `eager` to disable lazy loading. Default `lazy`. */
  loading?: 'lazy' | 'eager';
}

function PlaceholderSlot({
  Placeholder,
}: {
  Placeholder?: ImageWithFallbackProps['placeholderIcon'];
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50">
      {Placeholder ? <Placeholder className="h-10 w-10" aria-hidden /> : null}
    </div>
  );
}

export function ImageWithFallback({
  src,
  fallbackSrc,
  alt,
  placeholderIcon: Placeholder,
  aspectRatio,
  fit = 'cover',
  className,
  imgClassName,
  loading = 'lazy',
}: ImageWithFallbackProps) {
  const initialSrc = src ?? fallbackSrc ?? null;
  const [activeSrc, setActiveSrc] = useState<string | null>(initialSrc);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const next = src ?? fallbackSrc ?? null;
    setActiveSrc(next);
    setLoaded(false);
    setFailed(next === null);
  }, [src, fallbackSrc]);

  const handleError = () => {
    if (activeSrc === src && fallbackSrc) {
      setActiveSrc(fallbackSrc);
      setLoaded(false);
      return;
    }
    setFailed(true);
  };

  const showPlaceholder = failed || activeSrc === null;
  const showSkeleton = !loaded && !showPlaceholder;

  return (
    <div className={cn('relative overflow-hidden bg-muted', aspectRatio, className)}>
      {showSkeleton ? <Skeleton className="absolute inset-0 h-full w-full" /> : null}
      {showPlaceholder ? (
        <PlaceholderSlot Placeholder={Placeholder} />
      ) : (
        <img
          src={activeSrc ?? undefined}
          alt={alt}
          loading={loading}
          onLoad={() => setLoaded(true)}
          onError={handleError}
          className={cn(
            'h-full w-full transition-opacity duration-300',
            fit === 'cover' ? 'object-cover' : 'object-contain',
            loaded ? 'opacity-100' : 'opacity-0',
            imgClassName
          )}
        />
      )}
    </div>
  );
}
