/**
 * PRD-127 — duration parsing unit tests.
 */
import { describe, expect, it } from 'vitest';

import { parseDurationMinutes } from '../handlers/web/parse-duration.js';

describe('parseDurationMinutes', () => {
  it.each([
    ['PT5M', 5],
    ['PT45M', 45],
    ['PT1H', 60],
    ['PT1H30M', 90],
    ['PT2H15M', 135],
    ['PT45S', 1],
    ['pt5m', 5],
  ])('parses ISO %s → %d min', (input, expected) => {
    expect(parseDurationMinutes(input)).toBe(expected);
  });

  it.each([
    ['5 minutes', 5],
    ['5 mins', 5],
    ['10 min', 10],
    ['1 hour', 60],
    ['1 hr 30 min', 90],
    ['2 hrs', 120],
  ])('parses plain text %s → %d min', (input, expected) => {
    expect(parseDurationMinutes(input)).toBe(expected);
  });

  it('returns null for empty or zero durations', () => {
    expect(parseDurationMinutes('')).toBeNull();
    expect(parseDurationMinutes('0 minutes')).toBeNull();
    expect(parseDurationMinutes('PT0M')).toBeNull();
  });

  it('returns null for non-string / non-numeric input', () => {
    expect(parseDurationMinutes(undefined)).toBeNull();
    expect(parseDurationMinutes(42 as unknown)).toBeNull();
    expect(parseDurationMinutes({} as unknown)).toBeNull();
  });

  it('returns null for garbage strings', () => {
    expect(parseDurationMinutes('forever')).toBeNull();
  });
});
