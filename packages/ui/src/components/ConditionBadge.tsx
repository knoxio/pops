import type { ComponentProps } from 'react';

import { cn } from '../lib/utils';
import { Badge } from '../primitives/badge';

export type Condition = 'Excellent' | 'Good' | 'Fair' | 'Poor';

const conditionStyles: Record<Condition, string> = {
  Excellent: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400',
  Good: 'bg-info/10 text-info border-info/20 dark:text-info/80',
  Fair: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400',
  Poor: 'bg-destructive/10 text-destructive border-destructive/20 dark:text-destructive/80',
};

export interface ConditionBadgeProps extends Omit<
  ComponentProps<typeof Badge>,
  'variant' | 'children'
> {
  condition: Condition;
}

export function ConditionBadge({ condition, className, ...props }: ConditionBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-2xs uppercase tracking-wider font-semibold py-0 px-1.5 h-5',
        conditionStyles[condition],
        className
      )}
      {...props}
    >
      {condition}
    </Badge>
  );
}
