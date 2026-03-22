/**
 * InventoryCard — card for an inventory item in a grid or list view.
 * Shows photo thumbnail (or placeholder), item name, brand/model,
 * asset ID badge, type badge, condition badge, and location breadcrumb.
 */
import { useState } from "react";
import {
  cn,
  Skeleton,
  AssetIdBadge,
  ConditionBadge,
  TypeBadge,
  LocationBreadcrumb,
} from "@pops/ui";
import type { Condition, LocationSegment } from "@pops/ui";
import { Package } from "lucide-react";

export interface InventoryCardProps {
  id: string;
  itemName: string;
  brand?: string | null;
  model?: string | null;
  assetId?: string | null;
  type?: string | null;
  condition?: Condition | null;
  locationSegments?: LocationSegment[];
  photoUrl?: string | null;
  onClick?: (id: string) => void;
  onLocationNavigate?: (segment: LocationSegment) => void;
  className?: string;
}

export function InventoryCard({
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
}: InventoryCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const showPlaceholder = !photoUrl || imageError;
  const hasBadges = assetId || type || condition;

  return (
    <button
      type="button"
      aria-label={itemName}
      className={cn(
        "group flex w-full cursor-pointer gap-3 rounded-lg border border-border bg-card p-3 text-left",
        "border-l-4 border-l-amber-500/50",
        "transition-colors hover:bg-accent/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      onClick={() => onClick?.(id)}
    >
      {/* Photo thumbnail */}
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
        {!showPlaceholder && (
          <img
            src={photoUrl}
            alt={`${itemName} photo`}
            loading="lazy"
            className={cn(
              "h-full w-full object-cover transition-opacity duration-200",
              imageLoaded ? "opacity-100" : "opacity-0",
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
            <Package className="h-6 w-6 opacity-40" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Item name + subtitle */}
        <div>
          <h3 className="text-sm font-semibold leading-tight line-clamp-1">
            {itemName}
          </h3>
          {(brand || model) && (
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mt-0.5 opacity-80 line-clamp-1">
              {brand}
              {brand && model && (
                <span className="mx-1 opacity-50">&bull;</span>
              )}
              {model}
            </p>
          )}
        </div>

        {/* Badges row */}
        {hasBadges && (
          <div className="flex flex-wrap items-center gap-1">
            {assetId && <AssetIdBadge assetId={assetId} />}
            {type && <TypeBadge type={type} />}
            {condition && <ConditionBadge condition={condition} />}
          </div>
        )}

        {/* Location breadcrumb */}
        {locationSegments.length > 0 && (
          <LocationBreadcrumb
            segments={locationSegments}
            onNavigate={onLocationNavigate}
          />
        )}
      </div>
    </button>
  );
}

InventoryCard.displayName = "InventoryCard";
