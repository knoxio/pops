/**
 * MediaCard — generic image-card primitive.
 *
 * Wraps ImageWithFallback with title, subtitle, and badge/overlay slots.
 * Designed to be a thin shared base for domain-specific cards (MediaCard,
 * InventoryCard, etc.).
 */
import { type ComponentType, type MouseEvent, type ReactNode } from 'react';

import { cn } from '../lib/utils';
import { Card } from '../primitives/card';
import { ImageWithFallback } from './ImageWithFallback';

export interface MediaCardProps {
  src?: string | null;
  fallbackSrc?: string | null;
  alt: string;
  placeholderIcon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  aspectRatio?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Slot layered over the top-left of the image. */
  overlayTopLeft?: ReactNode;
  /** Slot layered over the top-right of the image. */
  overlayTopRight?: ReactNode;
  /** Slot layered over the bottom-left of the image. */
  overlayBottomLeft?: ReactNode;
  /** Slot below the image, after title/subtitle. */
  footer?: ReactNode;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  className?: string;
  imageClassName?: string;
}

export function MediaCard({
  src,
  fallbackSrc,
  alt,
  placeholderIcon,
  aspectRatio = 'aspect-[2/3]',
  title,
  subtitle,
  overlayTopLeft,
  overlayTopRight,
  overlayBottomLeft,
  footer,
  onClick,
  className,
  imageClassName,
}: MediaCardProps) {
  const interactive = typeof onClick === 'function';
  return (
    <Card
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(e as unknown as MouseEvent<HTMLDivElement>);
        }
      }}
      className={cn(
        'overflow-hidden p-0 gap-0',
        interactive && 'cursor-pointer transition-transform hover:-translate-y-0.5',
        className
      )}
    >
      <div className="relative">
        <ImageWithFallback
          src={src}
          fallbackSrc={fallbackSrc}
          alt={alt}
          placeholderIcon={placeholderIcon}
          aspectRatio={aspectRatio}
          className={imageClassName}
        />
        {overlayTopLeft ? <div className="absolute left-2 top-2 z-10">{overlayTopLeft}</div> : null}
        {overlayTopRight ? (
          <div className="absolute right-2 top-2 z-10">{overlayTopRight}</div>
        ) : null}
        {overlayBottomLeft ? (
          <div className="absolute bottom-2 left-2 z-10">{overlayBottomLeft}</div>
        ) : null}
      </div>
      {(title || subtitle || footer) && (
        <div className="flex flex-col gap-0.5 p-3">
          {title ? <div className="truncate text-sm font-medium">{title}</div> : null}
          {subtitle ? (
            <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
          ) : null}
          {footer ? <div className="mt-1.5">{footer}</div> : null}
        </div>
      )}
    </Card>
  );
}
