import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../db.js', () => ({
  getDrizzle: vi.fn(),
}));

vi.mock('@pops/db-types', () => ({
  shelfImpressions: {
    shelfId: 'shelf_id',
    shownAt: 'shown_at',
  },
}));

import { getDrizzle } from '../../../../db.js';
import {
  cleanupOldImpressions,
  getRecentImpressions,
  getShelfFreshness,
  initImpressionsService,
  recordImpressions,
} from './impressions.service.js';

const mockGetDrizzle = vi.mocked(getDrizzle);

/** Build a chainable Drizzle mock for insert operations. */
function makeInsertMock() {
  const mockRun = vi.fn();
  const mockValues = vi.fn().mockReturnValue({ run: mockRun });
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
  return { mockInsert, mockValues, mockRun };
}

/** Build a chainable Drizzle mock for select operations returning given rows. */
function makeSelectMock(rows: object[]) {
  const mockAll = vi.fn().mockReturnValue(rows);
  const mockGroupBy = vi.fn().mockReturnValue({ all: mockAll });
  const mockWhere = vi.fn().mockReturnValue({ groupBy: mockGroupBy, all: mockAll });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  return { mockSelect, mockFrom, mockWhere, mockGroupBy, mockAll };
}

/** Build a chainable Drizzle mock for delete operations. */
function makeDeleteMock() {
  const mockRun = vi.fn();
  const mockWhere = vi.fn().mockReturnValue({ run: mockRun });
  const mockDelete = vi.fn().mockReturnValue({ where: mockWhere });
  return { mockDelete, mockWhere, mockRun };
}

describe('recordImpressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when shelfIds is empty', () => {
    const mockInsert = vi.fn();
    mockGetDrizzle.mockReturnValue({ insert: mockInsert } as unknown as ReturnType<
      typeof getDrizzle
    >);

    recordImpressions([]);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('inserts one row per shelfId', () => {
    const { mockInsert, mockValues, mockRun } = makeInsertMock();
    mockGetDrizzle.mockReturnValue({ insert: mockInsert } as unknown as ReturnType<
      typeof getDrizzle
    >);

    recordImpressions(['trending', 'because-you-watched:42']);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith([
      { shelfId: 'trending' },
      { shelfId: 'because-you-watched:42' },
    ]);
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('inserts a single shelfId', () => {
    const { mockInsert, mockValues } = makeInsertMock();
    mockGetDrizzle.mockReturnValue({ insert: mockInsert } as unknown as ReturnType<
      typeof getDrizzle
    >);

    recordImpressions(['hidden-gems']);
    expect(mockValues).toHaveBeenCalledWith([{ shelfId: 'hidden-gems' }]);
  });
});

describe('getRecentImpressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty map when no impressions exist', () => {
    const { mockSelect } = makeSelectMock([]);
    mockGetDrizzle.mockReturnValue({ select: mockSelect } as unknown as ReturnType<
      typeof getDrizzle
    >);

    const result = getRecentImpressions(7);
    expect(result.size).toBe(0);
  });

  it('returns map of shelfId to count', () => {
    const rows = [
      { shelfId: 'trending', impressionCount: 3 },
      { shelfId: 'because-you-watched:42', impressionCount: 1 },
    ];
    const { mockSelect } = makeSelectMock(rows);
    mockGetDrizzle.mockReturnValue({ select: mockSelect } as unknown as ReturnType<
      typeof getDrizzle
    >);

    const result = getRecentImpressions(7);
    expect(result.size).toBe(2);
    expect(result.get('trending')).toBe(3);
    expect(result.get('because-you-watched:42')).toBe(1);
  });

  it('only returns shelves with impressions', () => {
    const rows = [{ shelfId: 'trending', impressionCount: 5 }];
    const { mockSelect } = makeSelectMock(rows);
    mockGetDrizzle.mockReturnValue({ select: mockSelect } as unknown as ReturnType<
      typeof getDrizzle
    >);

    const result = getRecentImpressions(7);
    expect(result.has('trending')).toBe(true);
    expect(result.has('new-releases')).toBe(false);
  });
});

describe('getShelfFreshness', () => {
  it('returns 1.0 when count is 0 (never shown)', () => {
    expect(getShelfFreshness(0)).toBe(1);
  });

  it('returns 0.5 when count is 1', () => {
    expect(getShelfFreshness(1)).toBeCloseTo(0.5);
  });

  it('decreases as count increases', () => {
    expect(getShelfFreshness(1)).toBeGreaterThan(getShelfFreshness(2));
    expect(getShelfFreshness(2)).toBeGreaterThan(getShelfFreshness(5));
  });

  it('floors at 0.1 for high counts', () => {
    expect(getShelfFreshness(100)).toBe(0.1);
    expect(getShelfFreshness(999)).toBe(0.1);
  });

  it('floors at 0.1 when formula would go below 0.1', () => {
    // 1/(1+9) = 0.1, exactly at floor
    expect(getShelfFreshness(9)).toBeCloseTo(0.1);
    // 1/(1+10) ≈ 0.091, floor kicks in
    expect(getShelfFreshness(10)).toBe(0.1);
  });
});

describe('cleanupOldImpressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls delete with a cutoff date', () => {
    const { mockDelete, mockWhere, mockRun } = makeDeleteMock();
    mockGetDrizzle.mockReturnValue({ delete: mockDelete } as unknown as ReturnType<
      typeof getDrizzle
    >);

    cleanupOldImpressions();

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockWhere).toHaveBeenCalledTimes(1);
    expect(mockRun).toHaveBeenCalledTimes(1);
  });
});

describe('initImpressionsService', () => {
  it('calls cleanupOldImpressions on init', () => {
    const { mockDelete, mockRun } = makeDeleteMock();
    mockGetDrizzle.mockReturnValue({ delete: mockDelete } as unknown as ReturnType<
      typeof getDrizzle
    >);

    initImpressionsService();
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockRun).toHaveBeenCalledTimes(1);
  });
});
