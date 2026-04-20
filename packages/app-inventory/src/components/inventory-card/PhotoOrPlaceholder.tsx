import { Package } from 'lucide-react';

import { Skeleton } from '@pops/ui';

interface PhotoOrPlaceholderProps {
  photoUrl?: string | null;
  showPlaceholder: boolean;
  imageLoaded: boolean;
  itemName: string;
  onLoad: () => void;
  onError: () => void;
  iconSizeClass: string;
  imgClassName: string;
}

export function PhotoOrPlaceholder({
  photoUrl,
  showPlaceholder,
  imageLoaded,
  itemName,
  onLoad,
  onError,
  iconSizeClass,
  imgClassName,
}: PhotoOrPlaceholderProps) {
  return (
    <>
      {!showPlaceholder && (
        <img
          src={photoUrl ?? undefined}
          alt={`${itemName} photo`}
          loading="lazy"
          className={imgClassName}
          onLoad={onLoad}
          onError={onError}
        />
      )}
      {!showPlaceholder && !imageLoaded && (
        <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
      )}
      {showPlaceholder && (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <Package className={`${iconSizeClass} opacity-40`} />
        </div>
      )}
    </>
  );
}
