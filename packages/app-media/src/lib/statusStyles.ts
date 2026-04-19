/**
 * Shared colour-map utilities for status badges across app-media.
 *
 * Centralises the mapping of status string → Tailwind class so every
 * badge component uses the same token set.
 */

/** Radarr/Sonarr download & monitoring statuses → badge class. */
export const ARR_STATUS_STYLES: Record<string, string> = {
  available: 'bg-success text-success-foreground',
  complete: 'bg-success text-success-foreground',
  monitored: 'bg-warning text-warning-foreground',
  downloading: 'bg-warning text-warning-foreground',
  partial: 'bg-warning text-warning-foreground',
  unmonitored: 'bg-muted text-muted-foreground',
  not_found: 'bg-muted text-muted-foreground',
};

/** Freshness level → badge class. */
export const FRESHNESS_STYLES: Record<string, string> = {
  Fresh: 'bg-success/20 text-success',
  Recent: 'bg-info/20 text-info',
  Fading: 'bg-warning/20 text-warning',
  Stale: 'bg-destructive/20 text-destructive',
};
