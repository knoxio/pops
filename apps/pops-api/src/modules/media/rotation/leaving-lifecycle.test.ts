import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock getDrizzle before importing the module under test
const mockGet = vi.fn();
const mockRun = vi.fn();
const mockWhere = vi.fn(() => ({ get: mockGet, run: mockRun }));
const mockSet = vi.fn(() => ({ where: mockWhere }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockUpdate = vi.fn(() => ({ set: mockSet }));

vi.mock('../../../db.js', () => ({
  getDrizzle: () => ({
    select: mockSelect,
    update: mockUpdate,
  }),
}));

// Must import after mocking
const { cancelLeaving, clearLeavingOnWatchlistAdd } = await import('./leaving-lifecycle.js');

describe('cancelLeaving', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false if movie does not exist', () => {
    mockGet.mockReturnValueOnce(undefined);
    expect(cancelLeaving(999)).toBe(false);
  });

  it('returns false if movie is not in leaving state', () => {
    mockGet.mockReturnValueOnce({ id: 1, rotationStatus: null });
    expect(cancelLeaving(1)).toBe(false);
  });

  it('clears leaving status and returns true', () => {
    mockGet.mockReturnValueOnce({ id: 1, rotationStatus: 'leaving' });
    expect(cancelLeaving(1)).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({
      rotationStatus: null,
      rotationExpiresAt: null,
      rotationMarkedAt: null,
    });
  });
});

describe('clearLeavingOnWatchlistAdd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false for non-movie media types', () => {
    expect(clearLeavingOnWatchlistAdd('tv_show', 1)).toBe(false);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('returns false if movie is not in leaving state', () => {
    mockGet.mockReturnValueOnce({ id: 1, rotationStatus: null });
    expect(clearLeavingOnWatchlistAdd('movie', 1)).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('clears leaving status for movies being added to watchlist', () => {
    mockGet.mockReturnValueOnce({ id: 5, rotationStatus: 'leaving' });
    expect(clearLeavingOnWatchlistAdd('movie', 5)).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({
      rotationStatus: null,
      rotationExpiresAt: null,
      rotationMarkedAt: null,
    });
  });
});
