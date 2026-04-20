import { TrendingDown, TrendingUp } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/utils';
import { Card } from '../primitives/card';

/**
 * Colour variants for StatCard.
 * Each variant maps to a set of design-token-backed Tailwind utilities.
 * emerald → success token, rose → destructive token, indigo → chart-1 token,
 * amber → warning token, sky → stat-sky token, violet → stat-violet token.
 */
const statCardColorMap = {
  emerald: {
    text: 'text-success',
    bg: 'bg-success/15',
    border: 'border-success/25',
    glow: 'shadow-[0_0_20px_-12px_color-mix(in_oklch,var(--success)_40%,transparent)]',
  },
  rose: {
    text: 'text-destructive',
    bg: 'bg-destructive/15',
    border: 'border-destructive/25',
    glow: 'shadow-[0_0_20px_-12px_color-mix(in_oklch,var(--destructive)_40%,transparent)]',
  },
  indigo: {
    text: 'text-chart-1',
    bg: 'bg-chart-1/15',
    border: 'border-chart-1/25',
    glow: 'shadow-[0_0_20px_-12px_color-mix(in_oklch,var(--chart-1)_40%,transparent)]',
  },
  amber: {
    text: 'text-warning',
    bg: 'bg-warning/15',
    border: 'border-warning/25',
    glow: 'shadow-[0_0_20px_-12px_color-mix(in_oklch,var(--warning)_40%,transparent)]',
  },
  sky: {
    text: 'text-stat-sky',
    bg: 'bg-stat-sky/15',
    border: 'border-stat-sky/25',
    glow: 'shadow-[0_0_20px_-12px_color-mix(in_oklch,var(--stat-sky)_40%,transparent)]',
  },
  violet: {
    text: 'text-stat-violet',
    bg: 'bg-stat-violet/15',
    border: 'border-stat-violet/25',
    glow: 'shadow-[0_0_20px_-12px_color-mix(in_oklch,var(--stat-violet)_40%,transparent)]',
  },
  slate: {
    text: 'text-foreground/80',
    bg: 'bg-muted/50',
    border: 'border-border',
    glow: 'shadow-none',
  },
} as const;

export type StatCardColor = keyof typeof statCardColorMap;

/** Trend data for the optional trend indicator. */
export interface StatCardTrend {
  /** Percentage change, e.g. 12.5 for +12.5%. */
  value: number;
  /** Direction of the trend. */
  direction: 'up' | 'down' | 'neutral';
}

export interface StatCardProps {
  title: string;
  value: string | number;
  description?: React.ReactNode;
  color?: StatCardColor;
  /** Optional trend indicator shown below the value. */
  trend?: StatCardTrend;
  className?: string;
  /** Makes the card interactive (navigates or triggers an action). */
  onClick?: () => void;
}

const trendIconClass = {
  up: 'text-success',
  down: 'text-destructive',
  neutral: 'text-muted-foreground',
} as const;

function trendIcon(direction: StatCardTrend['direction']) {
  if (direction === 'up') return <TrendingUp className="h-3 w-3" aria-hidden="true" />;
  if (direction === 'down') return <TrendingDown className="h-3 w-3" aria-hidden="true" />;
  return null;
}

function trendSign(direction: StatCardTrend['direction']) {
  if (direction === 'up') return '+';
  if (direction === 'down') return '-';
  return '';
}

function TrendBadge({ trend }: { trend: StatCardTrend }) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 text-2xs font-semibold',
        trendIconClass[trend.direction]
      )}
    >
      {trendIcon(trend.direction)}
      <span>
        {trendSign(trend.direction)}
        {Math.abs(trend.value)}%
      </span>
    </div>
  );
}

/**
 * StatCard — a high-impact card for displaying key metrics.
 */
export function StatCard({
  title,
  value,
  description,
  color = 'slate',
  trend,
  className,
  onClick,
}: StatCardProps) {
  const styles = statCardColorMap[color];

  return (
    <Card
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn(
        'p-5 flex flex-col gap-1 justify-between relative overflow-hidden group transition-all duration-300 hover:scale-[1.02]',
        onClick && 'cursor-pointer hover:bg-muted/50',
        styles.glow,
        styles.border,
        className
      )}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div
        className={cn(
          'absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full blur-3xl transition-opacity opacity-50 group-hover:opacity-80',
          styles.bg
        )}
      />
      <div className="space-y-1 relative z-10">
        <h3 className="text-2xs font-semibold text-muted-foreground uppercase tracking-widest">
          {title}
        </h3>
        <p className={cn('text-3xl font-bold tabular-nums tracking-normal', styles.text)}>
          {value}
        </p>
        {trend && <TrendBadge trend={trend} />}
      </div>
      {description && (
        <div className="text-2xs text-muted-foreground font-medium uppercase tracking-normal opacity-70 relative z-10">
          {description}
        </div>
      )}
    </Card>
  );
}
