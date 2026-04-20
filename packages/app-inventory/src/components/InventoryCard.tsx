import { HorizontalCard } from './inventory-card/HorizontalCard';
import { VerticalCard } from './inventory-card/VerticalCard';

import type { Condition, LocationSegment } from '@pops/ui';

export interface InventoryCardProps {
  id: string;
  itemName: string;
  brand?: string | null;
  model?: string | null;
  assetId?: string | null;
  type?: string | null;
  condition?: Condition | null;
  locationSegments?: LocationSegment[];
  /** Flat location name — used when locationSegments are not available. */
  locationName?: string | null;
  photoUrl?: string | null;
  /** Card layout: "horizontal" for list, "vertical" for grid. */
  layout?: 'horizontal' | 'vertical';
  onClick?: (id: string) => void;
  onLocationNavigate?: (segment: LocationSegment) => void;
  className?: string;
}

export function InventoryCard(props: InventoryCardProps) {
  if (props.layout === 'vertical') return <VerticalCard {...props} />;
  return <HorizontalCard {...props} />;
}

InventoryCard.displayName = 'InventoryCard';
