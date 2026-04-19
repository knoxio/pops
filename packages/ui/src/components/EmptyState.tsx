/**
 * EmptyState — shared empty-state panel used when a list/view has no data.
 *
 * Renders an optional icon, title, description, and action slot with
 * consistent spacing, typography, and muted colour tokens.
 */
import { type ComponentType, type ReactNode } from 'react';

import { cn } from '../lib/utils';

export interface EmptyStateProps {
  /** Optional lucide-react icon component rendered above the title. */
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** Primary heading. */
  title: ReactNode;
  /** Optional secondary description. */
  description?: ReactNode;
  /** Optional action node (button, link, etc.). */
  action?: ReactNode;
  /** Visual density. */
  size?: 'sm' | 'md' | 'lg';
  /** Additional classes for the outer wrapper. */
  className?: string;
}

const sizeStyles = {
  sm: { root: 'py-8 gap-2', icon: 'h-8 w-8 mb-2', title: 'text-sm', desc: 'text-xs' },
  md: { root: 'py-12 gap-3', icon: 'h-10 w-10 mb-3', title: 'text-base', desc: 'text-sm' },
  lg: { root: 'py-16 gap-4', icon: 'h-12 w-12 mb-4', title: 'text-lg', desc: 'text-sm' },
} as const;

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = 'md',
  className,
}: EmptyStateProps) {
  const styles = sizeStyles[size];
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center text-center px-6',
        styles.root,
        className
      )}
    >
      {Icon ? <Icon className={cn('text-muted-foreground/40', styles.icon)} aria-hidden /> : null}
      <div className={cn('font-semibold text-foreground', styles.title)}>{title}</div>
      {description ? (
        <div className={cn('text-muted-foreground max-w-md', styles.desc)}>{description}</div>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
