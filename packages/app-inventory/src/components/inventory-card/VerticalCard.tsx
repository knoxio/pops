import { MapPin } from 'lucide-react';
import { useState } from 'react';

import { AssetIdBadge, cn, LocationBreadcrumb, TypeBadge } from '@pops/ui';

import { PhotoOrPlaceholder } from './PhotoOrPlaceholder';

import type { InventoryCardProps } from '../InventoryCard';

function CardLocation({
  locationSegments,
  locationName,
  onLocationNavigate,
}: Pick<InventoryCardProps, 'locationSegments' | 'locationName' | 'onLocationNavigate'>) {
  const segments = locationSegments ?? [];
  const hasLocation = segments.length > 0 || locationName;
  if (!hasLocation) return null;
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <MapPin className="h-3 w-3 shrink-0" />
      {segments.length > 0 ? (
        <LocationBreadcrumb segments={segments} onNavigate={onLocationNavigate} />
      ) : (
        <span className="truncate">{locationName}</span>
      )}
    </div>
  );
}

export function VerticalCard(props: InventoryCardProps) {
  const { id, itemName, type, assetId, photoUrl, onClick, className } = props;
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const showPlaceholder = !photoUrl || imageError;

  return (
    <button
      type="button"
      aria-label={itemName}
      className={cn(
        'group flex w-full cursor-pointer flex-col rounded-lg border border-border bg-card text-left',
        'transition-all hover:bg-accent/50 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
      onClick={() => onClick?.(id)}
    >
      <div className="relative w-full overflow-hidden rounded-t-lg bg-muted aspect-[4/3]">
        <PhotoOrPlaceholder
          photoUrl={photoUrl}
          showPlaceholder={showPlaceholder}
          imageLoaded={imageLoaded}
          itemName={itemName}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          iconSizeClass="h-10 w-10"
          imgClassName={cn(
            'h-full w-full object-cover transition-opacity duration-200',
            'group-hover:opacity-90',
            imageLoaded ? 'opacity-100' : 'opacity-0'
          )}
        />
        {assetId && (
          <div className="absolute top-2 left-2">
            <AssetIdBadge assetId={assetId} />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <h3 className="text-sm font-semibold leading-tight line-clamp-2">{itemName}</h3>
        {type && (
          <div className="flex items-center">
            <TypeBadge type={type} />
          </div>
        )}
        <CardLocation
          locationSegments={props.locationSegments}
          locationName={props.locationName}
          onLocationNavigate={props.onLocationNavigate}
        />
      </div>
    </button>
  );
}
