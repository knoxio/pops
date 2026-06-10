/**
 * Wrapper tests — verify that pops-api's impressions wrapper resolves the
 * singleton drizzle handle and forwards to `@pops/media-db`. The package
 * itself owns the behavioural tests (in-memory SQLite + canonical
 * migration); these mocks check that no caller-visible arg gets dropped
 * or reordered at the seam.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../db.js', () => ({
  getDrizzle: vi.fn(),
}));

vi.mock('@pops/media-db', () => ({
  shelfImpressionsService: {
    recordImpressions: vi.fn(),
    getRecentImpressions: vi.fn(),
    getShelfFreshness: vi.fn(),
    cleanupOldImpressions: vi.fn(),
    initImpressionsService: vi.fn(),
  },
}));

import { shelfImpressionsService } from '@pops/media-db';

import { getDrizzle } from '../../../../db.js';
import {
  cleanupOldImpressions,
  getRecentImpressions,
  getShelfFreshness,
  initImpressionsService,
  recordImpressions,
} from './impressions.service.js';

const mockGetDrizzle = vi.mocked(getDrizzle);
const mockService = vi.mocked(shelfImpressionsService);

const FAKE_DB = { __brand: 'drizzle' } as unknown as ReturnType<typeof getDrizzle>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDrizzle.mockReturnValue(FAKE_DB);
});

describe('recordImpressions', () => {
  it('forwards the resolved db and shelf ids', () => {
    recordImpressions(['trending', 'because-you-watched:42']);
    expect(mockGetDrizzle).toHaveBeenCalledTimes(1);
    expect(mockService.recordImpressions).toHaveBeenCalledExactlyOnceWith(FAKE_DB, [
      'trending',
      'because-you-watched:42',
    ]);
  });

  it('forwards an empty list verbatim (package handles the no-op)', () => {
    recordImpressions([]);
    expect(mockService.recordImpressions).toHaveBeenCalledExactlyOnceWith(FAKE_DB, []);
  });
});

describe('getRecentImpressions', () => {
  it('forwards the resolved db + day window and returns the package result', () => {
    const returned = new Map<string, number>([['trending', 3]]);
    mockService.getRecentImpressions.mockReturnValue(returned);

    const result = getRecentImpressions(7);
    expect(mockService.getRecentImpressions).toHaveBeenCalledExactlyOnceWith(FAKE_DB, 7);
    expect(result).toBe(returned);
  });
});

describe('getShelfFreshness', () => {
  it('forwards the impression count (pure function — no db handle)', () => {
    mockService.getShelfFreshness.mockReturnValue(0.5);

    const result = getShelfFreshness(1);
    expect(mockService.getShelfFreshness).toHaveBeenCalledExactlyOnceWith(1);
    expect(mockGetDrizzle).not.toHaveBeenCalled();
    expect(result).toBe(0.5);
  });
});

describe('cleanupOldImpressions', () => {
  it('forwards the resolved db handle', () => {
    cleanupOldImpressions();
    expect(mockGetDrizzle).toHaveBeenCalledTimes(1);
    expect(mockService.cleanupOldImpressions).toHaveBeenCalledExactlyOnceWith(FAKE_DB);
  });
});

describe('initImpressionsService', () => {
  it('forwards the resolved db handle', () => {
    initImpressionsService();
    expect(mockGetDrizzle).toHaveBeenCalledTimes(1);
    expect(mockService.initImpressionsService).toHaveBeenCalledExactlyOnceWith(FAKE_DB);
  });
});
