import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
vi.mock("../../../db.js", () => ({
  getDrizzle: vi.fn(),
}));

vi.mock("@pops/db-types", () => ({
  movies: { id: "id", tmdbId: "tmdb_id" },
  watchHistory: { mediaId: "media_id", mediaType: "media_type" },
  mediaWatchlist: { mediaId: "media_id", mediaType: "media_type" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
}));

import { getDrizzle } from "../../../db.js";
import { getWatchedTmdbIds, getWatchlistTmdbIds, getDismissedTmdbIds } from "./flags.js";

const mockGetDrizzle = vi.mocked(getDrizzle);

function createMockDb(rows: { tmdbId: number }[]) {
  const mockAll = vi.fn().mockReturnValue(rows);
  const mockWhere = vi.fn().mockReturnValue({ all: mockAll });
  const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere, all: mockAll });
  const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin, where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  return { select: mockSelect } as unknown as ReturnType<typeof getDrizzle>;
}

describe("getWatchedTmdbIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty Set when no watch history", () => {
    mockGetDrizzle.mockReturnValue(createMockDb([]));
    const result = getWatchedTmdbIds();
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it("returns Set of watched TMDB IDs", () => {
    mockGetDrizzle.mockReturnValue(createMockDb([{ tmdbId: 100 }, { tmdbId: 200 }]));
    const result = getWatchedTmdbIds();
    expect(result.has(100)).toBe(true);
    expect(result.has(200)).toBe(true);
    expect(result.has(999)).toBe(false);
  });

  it("deduplicates multiple watch entries for same movie", () => {
    // Same TMDB ID watched twice
    mockGetDrizzle.mockReturnValue(createMockDb([{ tmdbId: 100 }, { tmdbId: 100 }]));
    const result = getWatchedTmdbIds();
    expect(result.size).toBe(1);
    expect(result.has(100)).toBe(true);
  });
});

describe("getWatchlistTmdbIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty Set when watchlist is empty", () => {
    mockGetDrizzle.mockReturnValue(createMockDb([]));
    const result = getWatchlistTmdbIds();
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it("returns Set of watchlisted TMDB IDs", () => {
    mockGetDrizzle.mockReturnValue(createMockDb([{ tmdbId: 300 }, { tmdbId: 400 }]));
    const result = getWatchlistTmdbIds();
    expect(result.has(300)).toBe(true);
    expect(result.has(400)).toBe(true);
    expect(result.has(999)).toBe(false);
  });
});

describe("getDismissedTmdbIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty Set when no dismissed movies", () => {
    const mockAll = vi.fn().mockReturnValue([]);
    mockGetDrizzle.mockReturnValue({ all: mockAll } as unknown as ReturnType<typeof getDrizzle>);
    const result = getDismissedTmdbIds();
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it("returns Set of dismissed TMDB IDs from raw SQL", () => {
    const mockAll = vi
      .fn()
      .mockReturnValue([{ tmdb_id: 500 }, { tmdb_id: 600 }]);
    mockGetDrizzle.mockReturnValue({ all: mockAll } as unknown as ReturnType<typeof getDrizzle>);
    const result = getDismissedTmdbIds();
    expect(result.has(500)).toBe(true);
    expect(result.has(600)).toBe(true);
    expect(result.has(999)).toBe(false);
  });

  it("returns empty Set when table does not exist yet", () => {
    const mockAll = vi.fn().mockImplementation(() => {
      throw new Error("no such table: dismissed_discover");
    });
    mockGetDrizzle.mockReturnValue({ all: mockAll } as unknown as ReturnType<typeof getDrizzle>);
    const result = getDismissedTmdbIds();
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });
});
