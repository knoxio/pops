import { useState } from 'react';

import {
  AssetIdBadge,
  cn,
  type Condition,
  ConditionBadge,
  LocationBreadcrumb,
  TypeBadge,
} from '@pops/ui';

import { PhotoOrPlaceholder } from './PhotoOrPlaceholder';

import type { InventoryCardProps } from '../InventoryCard';

function HorizontalCardBadges({
  assetId,
  type,
  condition,
}: {
  assetId?: string | null;
  type?: string | null;
  condition?: Condition | null;
}) {
  if (!assetId && !type && !condition) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {assetId && <AssetIdBadge assetId={assetId} />}
      {type && <TypeBadge type={type} />}
      {condition && <ConditionBadge condition={condition} />}
    </div>
  );
}

function NameAndBrand({
  itemName,
  brand,
  model,
}: {
  itemName: string;
  brand?: string | null;
  model?: string | null;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold leading-tight line-clamp-1">{itemName}</h3>
      {(brand ?? model) && (
        <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground mt-0.5 opacity-80 line-clamp-1">
          {brand}
          {brand && model && <span className="mx-1 opacity-50">&bull;</span>}
          {model}
        </p>
      )}
    </div>
  );
}

export function HorizontalCard(props: InventoryCardProps) {
  const {
    id,
    itemName,
    brand,
    model,
    assetId,
    type,
    condition,
    locationSegments = [],
    photoUrl,
    onClick,
    onLocationNavigate,
    className,
  } = props;
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const showPlaceholder = !photoUrl || imageError;

  return (
    <button
      type="button"
      aria-label={itemName}
      className={cn(
        'group flex w-full cursor-pointer gap-3 rounded-lg border border-border bg-card p-3 text-left',
        'border-l-4 border-l-app-accent/50',
        'transition-colors hover:bg-accent/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
      onClick={() => onClick?.(id)}
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
        <PhotoOrPlaceholder
          photoUrl={photoUrl}
          showPlaceholder={showPlaceholder}
          imageLoaded={imageLoaded}
          itemName={itemName}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          iconSizeClass="h-6 w-6"
          imgClassName={cn(
            'h-full w-full object-cover transition-opacity duration-200',
            imageLoaded ? 'opacity-100' : 'opacity-0'
          )}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <NameAndBrand itemName={itemName} brand={brand} model={model} />
        <HorizontalCardBadges assetId={assetId} type={type} condition={condition} />
        {locationSegments.length > 0 && (
          <LocationBreadcrumb segments={locationSegments} onNavigate={onLocationNavigate} />
        )}
      </div>
    </button>
  );
}
