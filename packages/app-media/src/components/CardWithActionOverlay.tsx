import { ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn, Skeleton } from '@pops/ui';

import type { ReactNode } from 'react';

/**
 * CardWithActionOverlay — poster card with hover-revealed action overlay.
 *
 * Provides:
 *  - Poster image with lazy loading, skeleton placeholder, and fallback.
 *  - A bottom-gradient overlay revealed on hover / focus-within.
 *  - Optional top-left and top-right badge slots (always visible).
 *
 * Used by ComparisonMovieCard and DiscoverCard to share the poster+overlay
 * shell without duplicating image-loading logic or hover CSS.
 */

export interface CardWithActionOverlayProps {
  src: string | null;
  alt: string;
  /** Extra classes on the root container. */
  className?: string;
  /** Aspect ratio class, default "aspect-[2/3]". */
  aspectClass?: string;
  /** Content rendered in the bottom hover overlay. */
  overlay?: ReactNode;
  /** Badge pinned to top-left corner. */
  topLeft?: ReactNode;
  /** Badge pinned to top-right corner. */
  topRight?: ReactNode;
  /** Whether to use lazy loading. Defaults to true. */
  lazy?: boolean;
  /** Called when the poster area itself is clicked (optional). */
  onClick?: () => void;
  disabled?: boolean;
  /** Gradient style for the overlay. Defaults to from-black/80. */
  overlayGradient?: string;
  'data-testid'?: string;
}

export function CardWithActionOverlay({
  src,
  alt,
  className,
  aspectClass = 'aspect-[2/3]',
  overlay,
  topLeft,
  topRight,
  lazy = true,
  onClick,
  disabled,
  overlayGradient = 'from-black/80',
  'data-testid': testId,
}: CardWithActionOverlayProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
    setImageLoaded(false);
  }, [src]);

  const showPlaceholder = !src || imageError;

  const inner = (
    <>
      {/* Poster */}
      {!showPlaceholder && (
        <img
          src={src}
          alt={alt}
          loading={lazy ? 'lazy' : 'eager'}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-200',
            onClick && 'group-hover:opacity-80',
            imageLoaded ? 'opacity-100' : 'opacity-0'
          )}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
        />
      )}

      {!showPlaceholder && !imageLoaded && (
        <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
      )}

      {showPlaceholder && (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <ImageOff className="h-8 w-8 opacity-40" />
        </div>
      )}

      {/* Top badges */}
      {topLeft && <div className="absolute top-2 left-2 z-10">{topLeft}</div>}
      {topRight && <div className="absolute top-2 right-2 z-10">{topRight}</div>}

      {/* Bottom overlay */}
      {overlay && (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent p-2 pt-8',
            overlayGradient,
            'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'
          )}
        >
          {overlay}
        </div>
      )}
    </>
  );

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-label={onClick ? alt : undefined}
      aria-disabled={onClick && disabled ? true : undefined}
      className={cn(
        'group relative w-full overflow-hidden rounded-md bg-muted',
        aspectClass,
        onClick && !disabled && 'cursor-pointer active:scale-[0.98] transition-transform',
        onClick && disabled && 'cursor-default',
        className
      )}
      data-testid={testId}
    >
      {inner}
    </div>
  );
}
