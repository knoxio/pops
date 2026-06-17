/**
 * Static context-collection definitions for time/date-aware discover rows.
 *
 * Each collection maps to a TMDB `/discover/movie` query via genre IDs and/or
 * keyword IDs. {@link getActiveCollections} picks up to `getMaxActiveCollections`
 * that match the current moment, falling back to rainy-day when fewer match.
 *
 * Ported from the monolith `discovery/context-collections.ts`; the
 * `maxActiveCollections` knob is read from ENV (`./config.js`) instead of
 * `core/settings`.
 */
import { getMaxActiveCollections } from './config.js';

export interface ContextCollection {
  id: string;
  title: string;
  emoji: string;
  genreIds: number[];
  /** TMDB keyword IDs (numeric). Use TMDB /search/keyword to find IDs. */
  keywordIds: number[];
  trigger: (hour: number, month: number, dayOfWeek: number) => boolean;
}

/** Day-of-week constants (JS Date.getDay()). */
const FRIDAY = 5;
const SATURDAY = 6;
const SUNDAY = 0;

const FALLBACK_ID = 'rainy-day';

export const CONTEXT_COLLECTIONS: ContextCollection[] = [
  {
    id: 'date-night',
    title: 'Date Night',
    emoji: '💕',
    genreIds: [10749, 35],
    keywordIds: [],
    trigger: (hour, _month, dayOfWeek) =>
      (dayOfWeek === FRIDAY || dayOfWeek === SATURDAY) && hour >= 18 && hour <= 22,
  },
  {
    id: 'sunday-flicks',
    title: 'Sunday Flicks',
    emoji: '☀️',
    genreIds: [18],
    keywordIds: [],
    trigger: (_hour, _month, dayOfWeek) => dayOfWeek === SUNDAY,
  },
  {
    id: 'late-night',
    title: 'Late Night Thrillers',
    emoji: '🌙',
    genreIds: [53, 9648],
    keywordIds: [],
    trigger: (hour) => hour >= 22 || hour <= 2,
  },
  {
    id: 'halloween',
    title: 'Halloween',
    emoji: '🎃',
    genreIds: [27],
    keywordIds: [3335],
    trigger: (_hour, month) => month === 10,
  },
  {
    id: 'christmas',
    title: 'Christmas Movies',
    emoji: '🎄',
    genreIds: [],
    keywordIds: [207317],
    trigger: (_hour, month) => month === 12,
  },
  {
    id: 'oscar-season',
    title: 'Oscar Winners',
    emoji: '🏆',
    genreIds: [],
    keywordIds: [293, 11487],
    trigger: (_hour, month) => month === 2 || month === 3,
  },
  {
    id: 'morning',
    title: 'Morning Watch',
    emoji: '🌅',
    genreIds: [35, 16, 10751],
    keywordIds: [],
    trigger: (hour) => hour >= 6 && hour <= 10,
  },
  {
    id: 'evening',
    title: 'Evening Picks',
    emoji: '🌆',
    genreIds: [18, 53, 28],
    keywordIds: [],
    trigger: (hour) => hour >= 18 && hour <= 22,
  },
  {
    id: 'weekend',
    title: 'Weekend Watch',
    emoji: '🎉',
    genreIds: [28, 12, 35],
    keywordIds: [],
    trigger: (_hour, _month, dayOfWeek) => dayOfWeek === SATURDAY || dayOfWeek === SUNDAY,
  },
  {
    id: 'seasonal',
    title: 'Summer Blockbusters',
    emoji: '☀️',
    genreIds: [28, 12, 878],
    keywordIds: [],
    trigger: (_hour, month) => month >= 6 && month <= 8,
  },
  {
    id: FALLBACK_ID,
    title: 'Rainy Day',
    emoji: '🌧️',
    genreIds: [35, 18, 16],
    keywordIds: [],
    trigger: () => true,
  },
];

/**
 * Return up to `getMaxActiveCollections` context collections whose trigger
 * matches the given time. If fewer non-fallback collections match, rainy-day
 * fills the remaining slots.
 */
export function getActiveCollections(
  hour: number,
  month: number,
  dayOfWeek: number
): ContextCollection[] {
  const maxActive = getMaxActiveCollections();
  const matched: ContextCollection[] = [];

  for (const col of CONTEXT_COLLECTIONS) {
    if (col.id === FALLBACK_ID) continue;
    if (col.trigger(hour, month, dayOfWeek)) {
      matched.push(col);
      if (matched.length === maxActive) return matched;
    }
  }

  const fallback = CONTEXT_COLLECTIONS.find((c) => c.id === FALLBACK_ID);
  if (fallback) {
    while (matched.length < maxActive) matched.push(fallback);
  }
  return matched;
}
