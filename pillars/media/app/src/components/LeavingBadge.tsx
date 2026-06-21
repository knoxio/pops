/**
 * LeavingBadge — countdown overlay showing when a movie is leaving the library.
 *
 * PRD-072 US-01
 */
import { cn } from '@pops/ui';

export interface LeavingBadgeProps {
  /** ISO timestamp of when the movie is scheduled to leave. */
  rotationExpiresAt: string;
  /** Additional CSS classes. */
  className?: string;
}

function getDaysRemaining(expiresAt: string): number {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diffMs = expires.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function getBadgeText(days: number): string {
  if (days <= 0) return 'Leaving today';
  if (days === 1) return 'Leaving tomorrow';
  if (days < 7) return `Leaving in ${days} days`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? 'Leaving in 1 week' : `Leaving in ${weeks} weeks`;
}

function getBadgeColor(days: number): string {
  if (days <= 3) return 'bg-destructive text-destructive-foreground';
  if (days <= 7) return 'bg-amber-500 text-white';
  return 'bg-muted text-muted-foreground';
}

export function LeavingBadge({ rotationExpiresAt, className }: LeavingBadgeProps) {
  const days = getDaysRemaining(rotationExpiresAt);
  const text = getBadgeText(days);
  const color = getBadgeColor(days);

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-tight',
        color,
        className
      )}
    >
      {text}
    </span>
  );
}

LeavingBadge.displayName = 'LeavingBadge';
