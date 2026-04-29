import { describe, expect, it } from 'vitest';

import { getBadgeText } from './LeavingBadge';

describe('getBadgeText', () => {
  it('returns "Leaving today" for 0 days', () => {
    expect(getBadgeText(0)).toBe('Leaving today');
  });

  it('returns "Leaving today" for negative days', () => {
    expect(getBadgeText(-1)).toBe('Leaving today');
  });

  it('returns "Leaving tomorrow" for 1 day', () => {
    expect(getBadgeText(1)).toBe('Leaving tomorrow');
  });

  it('returns day count for 2–6 days', () => {
    expect(getBadgeText(2)).toBe('Leaving in 2 days');
    expect(getBadgeText(6)).toBe('Leaving in 6 days');
  });

  it('returns "Leaving in 1 week" for exactly 7 days', () => {
    expect(getBadgeText(7)).toBe('Leaving in 1 week');
  });

  it('returns "Leaving in 1 week" for 8–13 days (floor, not round)', () => {
    expect(getBadgeText(10)).toBe('Leaving in 1 week');
    expect(getBadgeText(11)).toBe('Leaving in 1 week');
    expect(getBadgeText(13)).toBe('Leaving in 1 week');
  });

  it('returns "Leaving in 2 weeks" for 14 days', () => {
    expect(getBadgeText(14)).toBe('Leaving in 2 weeks');
  });

  it('returns "Leaving in 4 weeks" for 30 days', () => {
    expect(getBadgeText(30)).toBe('Leaving in 4 weeks');
  });
});
