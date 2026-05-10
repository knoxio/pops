import { cn } from '../lib/utils';
import { Badge } from '../primitives/badge';
import { STATUS_BADGE_BASE, statusBadgeToneClass } from './statusBadgeTones';

import type { ComponentProps } from 'react';

export interface TypeBadgeProps extends Omit<ComponentProps<typeof Badge>, 'variant' | 'children'> {
  type: string;
}

const typeStyles: Record<string, string> = {
  Electronics: statusBadgeToneClass.info,
  Furniture: statusBadgeToneClass.warning,
  Appliance: statusBadgeToneClass['stat-sky'],
  Clothing: statusBadgeToneClass['stat-rose'],
  Tools: statusBadgeToneClass.success,
  Sports: statusBadgeToneClass['stat-violet'],
};

export function TypeBadge({ type, className, ...props }: TypeBadgeProps) {
  const style = typeStyles[type] ?? statusBadgeToneClass.neutral;

  return (
    <Badge variant="outline" className={cn(STATUS_BADGE_BASE, style, className)} {...props}>
      {type}
    </Badge>
  );
}
