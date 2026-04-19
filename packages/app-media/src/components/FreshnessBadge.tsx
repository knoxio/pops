/**
 * FreshnessBadge — shows how recently a movie was watched and its staleness.
 *
 * Fresh (green, 0–30d), Recent (blue, 31–90d), Fading (yellow, 91–365d), Stale (red, 365+d).
 * If staleness < 1.0, always shows "Stale" regardless of days.
 * Returns null for unwatched movies (null daysSinceWatch).
 */

import { FRESHNESS_STYLES } from '../lib/statusStyles';

interface FreshnessBadgeProps {
  daysSinceWatch: number | null;
  staleness: number;
}

type FreshnessLevel = 'Fresh' | 'Recent' | 'Fading' | 'Stale';

function getLevel(daysSinceWatch: number, staleness: number): FreshnessLevel {
  if (staleness < 1.0) return 'Stale';
  if (daysSinceWatch <= 30) return 'Fresh';
  if (daysSinceWatch <= 90) return 'Recent';
  if (daysSinceWatch <= 365) return 'Fading';
  return 'Stale';
}

export function FreshnessBadge({ daysSinceWatch, staleness }: FreshnessBadgeProps) {
  if (daysSinceWatch === null) return null;

  const level = getLevel(daysSinceWatch, staleness);

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight ${FRESHNESS_STYLES[level]}`}
      data-testid="freshness-badge"
    >
      {level}
    </span>
  );
}
