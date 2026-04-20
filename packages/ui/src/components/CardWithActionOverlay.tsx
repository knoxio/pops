import { ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '../lib/utils';
import { Skeleton } from '../primitives/skeleton';

import type { KeyboardEvent, ReactNode } from 'react';

/**
 * Poster card with hover-revealed bottom overlay and optional corner badges.
 */
export interface CardWithActionOverlayProps {
  src: string | null;
  alt: string;
  className?: string;
  aspectClass?: string;
  overlay?: ReactNode;
  topLeft?: ReactNode;
  topRight?: ReactNode;
  lazy?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  overlayGradient?: string;
  'data-testid'?: string;
}

interface CardPosterContentProps {
  src: string | null;
  alt: string;
  lazy: boolean;
  hasOnClick: boolean;
  overlay?: ReactNode;
  topLeft?: ReactNode;
  topRight?: ReactNode;
  overlayGradient: string;
}

function PosterImage({
  src,
  alt,
  lazy,
  showHoverDim,
}: {
  src: string;
  alt: string;
  lazy: boolean;
  showHoverDim: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
    setLoaded(false);
  }, [src]);

  if (errored) return <PlaceholderIcon />;

  return (
    <>
      <img
        src={src}
        alt={alt}
        loading={lazy ? 'lazy' : 'eager'}
        className={cn(
          'h-full w-full object-cover transition-opacity duration-200',
          showHoverDim && 'group-hover:opacity-80',
          loaded ? 'opacity-100' : 'opacity-0'
        )}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
      />
      {!loaded && <Skeleton className="absolute inset-0 h-full w-full rounded-none" />}
    </>
  );
}

function PlaceholderIcon() {
  return (
    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
      <ImageOff className="h-8 w-8 opacity-40" />
    </div>
  );
}

function CardPosterContent({
  src,
  alt,
  lazy,
  hasOnClick,
  overlay,
  topLeft,
  topRight,
  overlayGradient,
}: CardPosterContentProps) {
  const showImage = !!src;
  const showHoverDim = hasOnClick || !!overlay;

  return (
    <>
      {showImage ? (
        <PosterImage src={src} alt={alt} lazy={lazy} showHoverDim={showHoverDim} />
      ) : (
        <PlaceholderIcon />
      )}

      {topLeft && <div className="absolute top-2 left-2 z-10">{topLeft}</div>}
      {topRight && <div className="absolute top-2 right-2 z-10">{topRight}</div>}

      {overlay && (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent p-2 pt-8',
            overlayGradient,
            'pointer-events-none opacity-0 transition-opacity',
            'group-hover:pointer-events-auto group-hover:opacity-100',
            'group-focus-within:pointer-events-auto group-focus-within:opacity-100'
          )}
        >
          {overlay}
        </div>
      )}
    </>
  );
}

function makeKeyHandler(onClick: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };
}

interface InteractiveCardProps {
  isInteractive: boolean;
  role?: 'button';
  tabIndex?: 0;
  onClickHandler?: () => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  ariaLabel?: string;
  ariaDisabled?: true;
  cursorClass?: string;
}

function getInteractiveProps(
  onClick: (() => void) | undefined,
  disabled: boolean | undefined,
  ariaLabel: string | undefined,
  alt: string
): InteractiveCardProps {
  const hasClick = !!onClick;
  if (!hasClick) return { isInteractive: false };
  const isInteractive = !disabled;
  return {
    isInteractive,
    role: isInteractive ? 'button' : undefined,
    tabIndex: isInteractive ? 0 : undefined,
    onClickHandler: isInteractive ? onClick : undefined,
    onKeyDown: isInteractive && onClick ? makeKeyHandler(onClick) : undefined,
    ariaLabel: ariaLabel ?? alt,
    ariaDisabled: disabled ? true : undefined,
    cursorClass: disabled ? 'cursor-default' : undefined,
  };
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
  ariaLabel,
  overlayGradient = 'from-black/80',
  'data-testid': testId,
}: CardWithActionOverlayProps) {
  const i = getInteractiveProps(onClick, disabled, ariaLabel, alt);

  return (
    <div
      role={i.role}
      tabIndex={i.tabIndex}
      onClick={i.onClickHandler}
      onKeyDown={i.onKeyDown}
      aria-label={i.ariaLabel}
      aria-disabled={i.ariaDisabled}
      className={cn(
        'group relative w-full overflow-hidden rounded-md bg-muted',
        aspectClass,
        i.isInteractive && 'cursor-pointer active:scale-[0.98] transition-transform',
        i.cursorClass,
        className
      )}
      data-testid={testId}
    >
      <CardPosterContent
        src={src}
        alt={alt}
        lazy={lazy}
        hasOnClick={!!onClick}
        overlay={overlay}
        topLeft={topLeft}
        topRight={topRight}
        overlayGradient={overlayGradient}
      />
    </div>
  );
}

CardWithActionOverlay.displayName = 'CardWithActionOverlay';
