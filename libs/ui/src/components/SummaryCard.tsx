import { cn } from '../lib/utils';

import type { ReactNode } from 'react';

export type SummaryCardVariant = 'success' | 'info' | 'destructive' | 'neutral';

const variantStyles: Record<SummaryCardVariant, { wrapper: string; value: string; label: string }> =
  {
    success: {
      wrapper: 'bg-success/5 border-success/20',
      value: 'text-success',
      label: 'text-success dark:text-success/60',
    },
    info: {
      wrapper: 'bg-info/5 border-info/20',
      value: 'text-info',
      label: 'text-info',
    },
    destructive: {
      wrapper: 'bg-destructive/5 border-destructive/20',
      value: 'text-destructive',
      label: 'text-destructive',
    },
    neutral: {
      wrapper: 'bg-muted border-border',
      value: 'text-foreground',
      label: 'text-muted-foreground',
    },
  };

export interface SummaryCardProps {
  /** Large number or metric displayed prominently */
  value: number | string;
  /** Short label below the value */
  label: string;
  /** Icon element rendered above the value */
  icon: ReactNode;
  /** Color scheme */
  variant?: SummaryCardVariant;
  className?: string;
}

/**
 * Compact metric card for import/process summaries (entities created, rules applied, etc.).
 */
export function SummaryCard({
  value,
  label,
  icon,
  variant = 'neutral',
  className,
}: SummaryCardProps) {
  const styles = variantStyles[variant];
  return (
    <div className={cn('border rounded-lg p-4 text-center', styles.wrapper, className)}>
      <div className="flex items-center justify-center mb-2">{icon}</div>
      <div className={cn('text-2xl font-semibold', styles.value)}>{value}</div>
      <div className={cn('text-xs', styles.label)}>{label}</div>
    </div>
  );
}
