/**
 * Tests for Plex sync scheduler — periodic polling and lifecycle management.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock dependencies
vi.mock("./service.js", () => ({
  getPlexClient: vi.fn(),
}));

vi.mock("./sync-movies.js", () => ({
  importMoviesFromPlex: vi.fn(),
}));

vi.mock("./sync-tv.js", () => ({
  importTvShowsFromPlex: vi.fn(),
}));

import {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  _resetScheduler,
  _triggerSync,
} from "./scheduler.js";
import { getPlexClient } from "./service.js";
import { importMoviesFromPlex } from "./sync-movies.js";
import { importTvShowsFromPlex } from "./sync-tv.js";
import type { PlexClient } from "./client.js";

const mockGetPlexClient = vi.mocked(getPlexClient);
const mockImportMovies = vi.mocked(importMoviesFromPlex);
const mockImportTvShows = vi.mocked(importTvShowsFromPlex);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  _resetScheduler();
});

afterEach(() => {
  _resetScheduler();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("startScheduler", () => {
  it("returns running status", () => {
    const status = startScheduler({ intervalMs: 5000 });

    expect(status.isRunning).toBe(true);
    expect(status.intervalMs).toBe(5000);
    expect(status.nextSyncAt).not.toBeNull();
  });

  it("uses default interval when not specified", () => {
    const status = startScheduler();

    expect(status.intervalMs).toBe(60 * 60 * 1000);
    expect(status.isRunning).toBe(true);
  });

  it("is a no-op when already running", () => {
    startScheduler({ intervalMs: 5000 });
    const status = startScheduler({ intervalMs: 10000 });

    // Should keep original interval
    expect(status.intervalMs).toBe(5000);
  });
});

describe("stopScheduler", () => {
  it("stops a running scheduler", () => {
    startScheduler({ intervalMs: 5000 });
    const status = stopScheduler();

    expect(status.isRunning).toBe(false);
    expect(status.nextSyncAt).toBeNull();
  });

  it("is a no-op when not running", () => {
    const status = stopScheduler();
    expect(status.isRunning).toBe(false);
  });
});

describe("getSchedulerStatus", () => {
  it("returns initial state", () => {
    const status = getSchedulerStatus();

    expect(status.isRunning).toBe(false);
    expect(status.lastSyncAt).toBeNull();
    expect(status.lastSyncError).toBeNull();
    expect(status.nextSyncAt).toBeNull();
    expect(status.moviesSynced).toBe(0);
    expect(status.tvShowsSynced).toBe(0);
  });

  it("reflects running state after start", () => {
    startScheduler({ intervalMs: 5000 });
    const status = getSchedulerStatus();

    expect(status.isRunning).toBe(true);
    expect(status.intervalMs).toBe(5000);
  });
});

describe("sync execution", () => {
  it("runs sync on interval tick", async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockImportMovies.mockResolvedValue({
      total: 5,
      processed: 5,
      synced: 3,
      skipped: 2,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 2,
      processed: 2,
      synced: 1,
      skipped: 1,
      episodesMatched: 5,
      errors: [],
    });

    startScheduler({ intervalMs: 5000 });

    // Advance past interval
    vi.advanceTimersByTime(5000);
    // Let promises settle
    await vi.advanceTimersByTimeAsync(0);

    const status = getSchedulerStatus();
    expect(status.lastSyncAt).not.toBeNull();
    expect(status.lastSyncError).toBeNull();
    expect(status.moviesSynced).toBe(3);
    expect(status.tvShowsSynced).toBe(1);
    expect(mockImportMovies).toHaveBeenCalledWith(mockClient, "1");
    expect(mockImportTvShows).toHaveBeenCalledWith(mockClient, "2");
  });

  it("records error when Plex is not configured", async () => {
    mockGetPlexClient.mockReturnValue(null);

    await _triggerSync();

    const status = getSchedulerStatus();
    expect(status.lastSyncError).toContain("Plex not configured");
    expect(status.lastSyncAt).not.toBeNull();
  });

  it("records error when sync throws", async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockImportMovies.mockRejectedValue(new Error("Network timeout"));

    await _triggerSync();

    const status = getSchedulerStatus();
    expect(status.lastSyncError).toContain("Network timeout");
    expect(status.lastSyncAt).not.toBeNull();
  });

  it("continues running after sync error", async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockImportMovies.mockRejectedValue(new Error("Plex down"));

    startScheduler({ intervalMs: 5000 });

    // First tick — error
    vi.advanceTimersByTime(5000);
    await vi.advanceTimersByTimeAsync(0);

    expect(getSchedulerStatus().isRunning).toBe(true);
    expect(getSchedulerStatus().lastSyncError).toContain("Plex down");

    // Second tick — success
    mockImportMovies.mockResolvedValue({
      total: 1,
      processed: 1,
      synced: 1,
      skipped: 0,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      episodesMatched: 0,
      errors: [],
    });

    vi.advanceTimersByTime(5000);
    await vi.advanceTimersByTimeAsync(0);

    expect(getSchedulerStatus().isRunning).toBe(true);
    expect(getSchedulerStatus().lastSyncError).toBeNull();
    expect(getSchedulerStatus().moviesSynced).toBe(1);
  });

  it("accumulates sync counts across multiple cycles", async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockImportMovies.mockResolvedValue({
      total: 2,
      processed: 2,
      synced: 2,
      skipped: 0,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 1,
      processed: 1,
      synced: 1,
      skipped: 0,
      episodesMatched: 3,
      errors: [],
    });

    startScheduler({ intervalMs: 1000 });

    // Run 3 cycles
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(1000);
      await vi.advanceTimersByTimeAsync(0);
    }

    const status = getSchedulerStatus();
    expect(status.moviesSynced).toBe(6);
    expect(status.tvShowsSynced).toBe(3);
  });

  it("uses custom section IDs", async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockImportMovies.mockResolvedValue({
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      episodesMatched: 0,
      errors: [],
    });

    startScheduler({
      intervalMs: 1000,
      movieSectionId: "3",
      tvSectionId: "4",
    });

    vi.advanceTimersByTime(1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockImportMovies).toHaveBeenCalledWith(mockClient, "3");
    expect(mockImportTvShows).toHaveBeenCalledWith(mockClient, "4");
  });

  it("does not sync after stop", async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockImportMovies.mockResolvedValue({
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      episodesMatched: 0,
      errors: [],
    });

    startScheduler({ intervalMs: 5000 });
    stopScheduler();

    vi.advanceTimersByTime(10000);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockImportMovies).not.toHaveBeenCalled();
    expect(mockImportTvShows).not.toHaveBeenCalled();
  });
});

describe("_triggerSync", () => {
  it("runs a sync cycle immediately", async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockImportMovies.mockResolvedValue({
      total: 1,
      processed: 1,
      synced: 1,
      skipped: 0,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      episodesMatched: 0,
      errors: [],
    });

    await _triggerSync();

    expect(mockImportMovies).toHaveBeenCalledOnce();
    expect(mockImportTvShows).toHaveBeenCalledOnce();
    expect(getSchedulerStatus().lastSyncAt).not.toBeNull();
    expect(getSchedulerStatus().moviesSynced).toBe(1);
  });
});
