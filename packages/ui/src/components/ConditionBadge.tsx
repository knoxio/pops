import { cn } from '../lib/utils';
import { Badge } from '../primitives/badge';

import type { ComponentProps } from 'react';

/**
 * Condition values accepted by the badge.
 * Lowercase values are canonical; Title Case variants are legacy aliases
 * from older seeded/stored data and are normalised at display time.
 */
export type Condition =
  | 'new'
  | 'good'
  | 'fair'
  | 'poor'
  | 'broken'
  | 'New'
  | 'Good'
  | 'Fair'
  | 'Poor'
  | 'Broken'
  | 'Excellent';

/** Normalise any condition string to lowercase for consistent lookup. */
function normalise(condition: string): string {
  return condition.toLowerCase();
}

type NormalisedCondition = 'new' | 'good' | 'fair' | 'poor' | 'broken';

const conditionStyles: Record<NormalisedCondition, string> = {
  new: 'bg-info/10 text-info border-info/20 dark:text-info/80',
  good: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400',
  fair: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400',
  poor: 'bg-orange-500/10 text-orange-700 border-orange-500/20 dark:text-orange-400',
  broken: 'bg-destructive/10 text-destructive border-destructive/20 dark:text-destructive/80',
};

const KNOWN_CONDITIONS = new Set<string>(['new', 'good', 'fair', 'poor', 'broken']);

function resolveStyles(condition: string): string {
  const lower = normalise(condition);
  // "excellent" is treated as a legacy alias for "good"
  const key = lower === 'excellent' ? 'good' : lower;
  return KNOWN_CONDITIONS.has(key) ? conditionStyles[key as NormalisedCondition] : '';
}

export interface ConditionBadgeProps extends Omit<
  ComponentProps<typeof Badge>,
  'variant' | 'children'
> {
  condition: Condition;
}

export function ConditionBadge({ condition, className, ...props }: ConditionBadgeProps) {
  const styles = resolveStyles(condition);
  if (!styles) return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        'text-2xs uppercase tracking-wider font-semibold py-0 px-1.5 h-5',
        styles,
        className
      )}
      {...props}
    >
      {condition}
    </Badge>
  );
}
