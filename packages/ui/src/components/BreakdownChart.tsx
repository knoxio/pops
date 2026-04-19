/**
 * BreakdownChart — horizontal-bar breakdown of labelled values.
 *
 * Zero-dependency, styled with design tokens. Standard states for loading
 * and error are provided, plus optional click handler per bar.
 */
import { type ReactNode } from 'react';

import { cn } from '../lib/utils';
import { Button } from '../primitives/button';
import { Skeleton } from '../primitives/skeleton';
import { EmptyState } from './EmptyState';

export interface BreakdownDatum {
  label: string;
  value: number;
  /** Optional accent colour for the bar. */
  color?: string;
}

export interface BreakdownChartProps {
  data: BreakdownDatum[];
  /** Formats bar values for display. */
  formatter?: (value: number) => string;
  /** Click handler per bar row. */
  onBarClick?: (label: string) => void;
  /** Loading state renders skeleton rows. */
  loading?: boolean;
  /** Error state renders an alert with an optional retry. */
  error?: string | null;
  onRetry?: () => void;
  /** Max rows before scroll. Default unlimited. */
  maxRows?: number;
  /** Empty-state content when data is empty. */
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  className?: string;
}

const defaultFormatter = (v: number) => v.toLocaleString();

export function BreakdownChart({
  data,
  formatter = defaultFormatter,
  onBarClick,
  loading,
  error,
  onRetry,
  maxRows,
  emptyTitle = 'No data',
  emptyDescription,
  className,
}: BreakdownChartProps) {
  if (loading) {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div
        className={cn(
          'flex flex-col items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm',
          className
        )}
        role="alert"
      >
        <div className="font-medium text-destructive">{error}</div>
        {onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        size="sm"
        className={className}
      />
    );
  }

  const rows = typeof maxRows === 'number' ? data.slice(0, maxRows) : data;
  const max = Math.max(...rows.map((d) => d.value), 0);

  return (
    <ul className={cn('flex flex-col gap-1.5', className)}>
      {rows.map((row) => {
        const pct = max === 0 ? 0 : Math.round((row.value / max) * 100);
        const interactive = typeof onBarClick === 'function';
        return (
          <li key={row.label}>
            <button
              type="button"
              onClick={onBarClick ? () => onBarClick(row.label) : undefined}
              disabled={!interactive}
              className={cn(
                'group relative flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors',
                interactive && 'hover:bg-accent'
              )}
            >
              <div className="w-32 shrink-0 truncate text-xs font-medium">{row.label}</div>
              <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-muted">
                <div
                  className="h-full rounded-sm transition-all"
                  style={{
                    width: `${pct}%`,
                    // Keep tiny non-zero bars visible without inflating the %.
                    minWidth: row.value > 0 ? '2px' : 0,
                    background: row.color ?? 'var(--chart-1, oklch(0.65 0.2 240))',
                  }}
                />
              </div>
              <div className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {formatter(row.value)}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
