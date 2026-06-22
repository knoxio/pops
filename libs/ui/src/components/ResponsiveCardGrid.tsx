/**
 * ResponsiveCardGrid — responsive CSS grid wrapper with per-breakpoint
 * column counts. Retires inline `grid grid-cols-N md:…` class strings.
 */
import { type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '../lib/utils';

export interface ResponsiveCardGridCols {
  base?: number;
  sm?: number;
  md?: number;
  lg?: number;
  xl?: number;
  '2xl'?: number;
}

export interface ResponsiveCardGridProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Columns per breakpoint. Default `{ base: 2, md: 3, lg: 4, xl: 6 }`. */
  cols?: ResponsiveCardGridCols;
  /** Gap scale token. Default `gap-3`. */
  gapClassName?: string;
}

const breakpointVars: Record<keyof ResponsiveCardGridCols, string> = {
  base: '--grid-cols-base',
  sm: '--grid-cols-sm',
  md: '--grid-cols-md',
  lg: '--grid-cols-lg',
  xl: '--grid-cols-xl',
  '2xl': '--grid-cols-2xl',
};

const responsiveClasses = [
  'grid-cols-[repeat(var(--grid-cols-base),minmax(0,1fr))]',
  'sm:grid-cols-[repeat(var(--grid-cols-sm,var(--grid-cols-base)),minmax(0,1fr))]',
  'md:grid-cols-[repeat(var(--grid-cols-md,var(--grid-cols-sm,var(--grid-cols-base))),minmax(0,1fr))]',
  'lg:grid-cols-[repeat(var(--grid-cols-lg,var(--grid-cols-md,var(--grid-cols-sm,var(--grid-cols-base)))),minmax(0,1fr))]',
  'xl:grid-cols-[repeat(var(--grid-cols-xl,var(--grid-cols-lg,var(--grid-cols-md,var(--grid-cols-sm,var(--grid-cols-base))))),minmax(0,1fr))]',
  '2xl:grid-cols-[repeat(var(--grid-cols-2xl,var(--grid-cols-xl,var(--grid-cols-lg,var(--grid-cols-md,var(--grid-cols-sm,var(--grid-cols-base)))))),minmax(0,1fr))]',
].join(' ');

export function ResponsiveCardGrid({
  children,
  cols = { base: 2, md: 3, lg: 4, xl: 6 },
  gapClassName = 'gap-3',
  className,
  style,
  ...rest
}: ResponsiveCardGridProps) {
  const varStyle: CSSProperties = {};
  (Object.keys(cols) as (keyof ResponsiveCardGridCols)[]).forEach((k) => {
    const v = cols[k];
    if (typeof v === 'number') {
      (varStyle as Record<string, string>)[breakpointVars[k]] = String(v);
    }
  });

  return (
    <div
      className={cn('grid', responsiveClasses, gapClassName, className)}
      style={{ ...varStyle, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

export { ResponsiveCardGrid as MediaGrid };
