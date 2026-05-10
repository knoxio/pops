/**
 * Shared tonal class strings for small status / category badges.
 *
 * These map semantic intents (success, warning, info, etc.) onto the design
 * tokens defined in `theme/globals.css`. Components like `ConditionBadge`,
 * `WarrantyBadge`, and `TypeBadge` use these instead of hardcoded Tailwind
 * colour utilities (e.g. `bg-emerald-500/10`) so palette changes propagate
 * through the token layer and dark mode is handled uniformly.
 *
 * Pattern matches the established usage in this folder:
 *   `bg-<tone>/10 text-<tone> border-<tone>/20 dark:text-<tone>/80`
 */
export type StatusBadgeTone =
  | 'success'
  | 'warning'
  | 'info'
  | 'destructive'
  | 'neutral'
  | 'stat-sky'
  | 'stat-violet'
  | 'stat-rose'
  | 'stat-orange';

export const statusBadgeToneClass: Record<StatusBadgeTone, string> = {
  success: 'bg-success/10 text-success border-success/20 dark:text-success/80',
  warning: 'bg-warning/10 text-warning border-warning/20 dark:text-warning/80',
  info: 'bg-info/10 text-info border-info/20 dark:text-info/80',
  destructive: 'bg-destructive/10 text-destructive border-destructive/20 dark:text-destructive/80',
  neutral: 'bg-muted text-muted-foreground border-transparent',
  'stat-sky': 'bg-stat-sky/10 text-stat-sky border-stat-sky/20 dark:text-stat-sky/80',
  'stat-violet':
    'bg-stat-violet/10 text-stat-violet border-stat-violet/20 dark:text-stat-violet/80',
  'stat-rose': 'bg-stat-rose/10 text-stat-rose border-stat-rose/20 dark:text-stat-rose/80',
  'stat-orange':
    'bg-stat-orange/10 text-stat-orange border-stat-orange/20 dark:text-stat-orange/80',
};

/** Shared base classes for compact status / category badges. */
export const STATUS_BADGE_BASE = 'text-2xs uppercase tracking-wider font-semibold py-0 px-1.5 h-5';
