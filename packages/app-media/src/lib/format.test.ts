import { describe, expect, it } from 'vitest';

import {
  formatCurrency,
  formatEpisodeCode,
  formatLanguage,
  formatRuntime,
  formatYearRange,
} from './format';

describe('formatRuntime', () => {
  it('formats hours and minutes', () => {
    expect(formatRuntime(148)).toBe('2h 28m');
  });

  it('formats exactly one hour', () => {
    expect(formatRuntime(60)).toBe('1h 0m');
  });

  it('formats minutes only when under an hour', () => {
    expect(formatRuntime(45)).toBe('45m');
  });

  it('formats zero minutes', () => {
    expect(formatRuntime(0)).toBe('0m');
  });
});

describe('formatCurrency', () => {
  it('formats large budgets', () => {
    expect(formatCurrency(150000000)).toBe('$150,000,000');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0');
  });
});

describe('formatLanguage', () => {
  it('maps en to English', () => {
    expect(formatLanguage('en')).toBe('English');
  });

  it('maps ja to Japanese', () => {
    expect(formatLanguage('ja')).toBe('Japanese');
  });

  it('maps fr to French', () => {
    expect(formatLanguage('fr')).toBe('French');
  });

  it('maps ko to Korean', () => {
    expect(formatLanguage('ko')).toBe('Korean');
  });

  it('maps zh to Chinese', () => {
    expect(formatLanguage('zh')).toBe('Chinese');
  });

  it('is case-insensitive', () => {
    expect(formatLanguage('EN')).toBe('English');
    expect(formatLanguage('En')).toBe('English');
  });

  it('returns uppercased code for unknown languages', () => {
    expect(formatLanguage('xx')).toBe('XX');
  });
});

describe('formatEpisodeCode', () => {
  it('zero-pads single-digit season and episode', () => {
    expect(formatEpisodeCode(1, 3)).toBe('S01E03');
  });

  it('zero-pads single-digit season with double-digit episode', () => {
    expect(formatEpisodeCode(2, 10)).toBe('S02E10');
  });

  it('handles double-digit season and episode', () => {
    expect(formatEpisodeCode(12, 24)).toBe('S12E24');
  });

  it('handles triple-digit episode numbers', () => {
    expect(formatEpisodeCode(1, 100)).toBe('S01E100');
  });
});

describe('formatYearRange', () => {
  it('returns null when no first air date', () => {
    expect(formatYearRange(null, null, null)).toBeNull();
  });

  it('shows year–Present for returning series', () => {
    expect(formatYearRange('2020-01-15', '2024-06-01', 'Returning Series')).toBe('2020–Present');
  });

  it('shows year–Present for in-production show', () => {
    expect(formatYearRange('2022-03-01', null, 'In Production')).toBe('2022–Present');
  });

  it('shows start–end for ended show spanning multiple years', () => {
    expect(formatYearRange('2008-01-20', '2013-09-29', 'Ended')).toBe('2008–2013');
  });

  it('shows single year for ended show in same year', () => {
    expect(formatYearRange('2020-01-01', '2020-12-31', 'Ended')).toBe('2020');
  });

  it('shows single year when no last air date and not ongoing', () => {
    expect(formatYearRange('2019-05-01', null, 'Ended')).toBe('2019');
  });

  it('shows single year when status is null', () => {
    expect(formatYearRange('2021-01-01', null, null)).toBe('2021');
  });
});
