import { cn } from '../lib/utils';
import { Badge } from '../primitives/badge';
import { STATUS_BADGE_BASE, statusBadgeToneClass } from './statusBadgeTones';

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
  new: statusBadgeToneClass.info,
  good: statusBadgeToneClass.success,
  fair: statusBadgeToneClass.warning,
  poor: statusBadgeToneClass['stat-orange'],
  broken: statusBadgeToneClass.destructive,
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
    <Badge variant="outline" className={cn(STATUS_BADGE_BASE, styles, className)} {...props}>
      {condition}
    </Badge>
  );
}
