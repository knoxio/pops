import { cn } from '../lib/utils';
import { Badge } from '../primitives/badge';
import { STATUS_BADGE_BASE, statusBadgeToneClass } from './statusBadgeTones';

import type { ComponentProps } from 'react';

type WarrantyState = 'expired' | 'expiring' | 'active' | 'none';

interface WarrantyInfo {
  state: WarrantyState;
  label: string;
}

const warrantyStyles: Record<WarrantyState, string> = {
  expired: statusBadgeToneClass.destructive,
  expiring: statusBadgeToneClass.warning,
  active: statusBadgeToneClass.success,
  none: statusBadgeToneClass.neutral,
};

/** Compute warranty status from an expiry date string (or null). */
export function getWarrantyStatus(warrantyExpiry: string | null): WarrantyInfo {
  if (!warrantyExpiry) return { state: 'none', label: 'No warranty' };

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(warrantyExpiry);
  expiry.setHours(0, 0, 0, 0);

  const diffMs = expiry.getTime() - now.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0) return { state: 'expired', label: 'Expired' };
  if (days <= 90) return { state: 'expiring', label: `Expires in ${days} days` };

  const formatted = expiry.toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return { state: 'active', label: `Warranty until ${formatted}` };
}

export interface WarrantyBadgeProps extends Omit<
  ComponentProps<typeof Badge>,
  'variant' | 'children'
> {
  warrantyExpiry: string | null;
}

export function WarrantyBadge({ warrantyExpiry, className, ...props }: WarrantyBadgeProps) {
  const { state, label } = getWarrantyStatus(warrantyExpiry);
  return (
    <Badge
      variant="outline"
      className={cn(STATUS_BADGE_BASE, warrantyStyles[state], className)}
      {...props}
    >
      {label}
    </Badge>
  );
}
