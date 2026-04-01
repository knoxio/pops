/**
 * Radarr client tests — uses mocked fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RadarrClient } from "./radarr-client.js";
import { ArrApiError } from "./types.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "Content-Type": "application/json" },
  });
}

describe("RadarrClient", () => {
  let client: RadarrClient;

  beforeEach(() => {
    client = new RadarrClient("http://localhost:7878", "test-api-key");
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getQualityProfiles", () => {
    it("returns typed quality profiles", async () => {
      const profiles = [
        { id: 1, name: "HD-1080p" },
        { id: 2, name: "Ultra-HD" },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse(profiles));

      const result = await client.getQualityProfiles();

      expect(result).toEqual(profiles);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:7878/api/v3/qualityprofile",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("throws ArrApiError on 401", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401, statusText: "Unauthorized" })
      );

      await expect(client.getQualityProfiles()).rejects.toThrow(ArrApiError);
    });
  });

  describe("getRootFolders", () => {
    it("returns typed root folders with free space", async () => {
      const folders = [
        { id: 1, path: "/movies", freeSpace: 500000000000 },
        { id: 2, path: "/movies-4k", freeSpace: 200000000000 },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse(folders));

      const result = await client.getRootFolders();

      expect(result).toEqual(folders);
      expect(result[0]?.freeSpace).toBe(500000000000);
    });
  });

  describe("checkMovie", () => {
    it("returns exists: true with radarrId and monitored when found", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse([
          { id: 42, title: "Test Movie", tmdbId: 12345, monitored: true, hasFile: false },
        ])
      );

      const result = await client.checkMovie(12345);

      expect(result).toEqual({ exists: true, radarrId: 42, monitored: true });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:7878/api/v3/movie?tmdbId=12345",
        expect.anything()
      );
    });

    it("returns exists: false when movie not found", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      const result = await client.checkMovie(99999);

      expect(result).toEqual({ exists: false });
    });

    it("throws ArrApiError on network failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(client.checkMovie(12345)).rejects.toThrow("Network error");
    });
  });

  describe("addMovie", () => {
    it("sends correct payload and returns created movie", async () => {
      const createdMovie = {
        id: 42,
        title: "Test Movie",
        tmdbId: 12345,
        monitored: true,
        hasFile: false,
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(createdMovie));

      const result = await client.addMovie({
        tmdbId: 12345,
        title: "Test Movie",
        year: 2024,
        qualityProfileId: 1,
        rootFolderPath: "/movies",
      });

      expect(result).toEqual(createdMovie);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:7878/api/v3/movie",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            tmdbId: 12345,
            title: "Test Movie",
            year: 2024,
            qualityProfileId: 1,
            rootFolderPath: "/movies",
            monitored: true,
            addOptions: { searchForMovie: true },
          }),
        })
      );
    });

    it("throws ArrApiError on 401", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401, statusText: "Unauthorized" })
      );

      await expect(
        client.addMovie({
          tmdbId: 1,
          title: "X",
          year: 2024,
          qualityProfileId: 1,
          rootFolderPath: "/m",
        })
      ).rejects.toThrow(ArrApiError);
    });
  });

  describe("updateMonitoring", () => {
    it("fetches movie, merges monitored flag, and PUTs full object", async () => {
      const existingMovie = {
        id: 42,
        title: "Test Movie",
        tmdbId: 12345,
        monitored: true,
        hasFile: true,
        qualityProfileId: 1,
      };
      const updatedMovie = { ...existingMovie, monitored: false };

      // First call: GET movie
      mockFetch.mockResolvedValueOnce(jsonResponse(existingMovie));
      // Second call: PUT movie
      mockFetch.mockResolvedValueOnce(jsonResponse(updatedMovie));

      const result = await client.updateMonitoring(42, false);

      expect(result.monitored).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "http://localhost:7878/api/v3/movie/42",
        expect.objectContaining({ method: "GET" })
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "http://localhost:7878/api/v3/movie/42",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ ...existingMovie, monitored: false }),
        })
      );
    });
  });

  describe("triggerSearch", () => {
    it("sends MoviesSearch command with correct movieIds", async () => {
      const commandResult = { id: 1, name: "MoviesSearch", status: "started" };
      mockFetch.mockResolvedValueOnce(jsonResponse(commandResult));

      const result = await client.triggerSearch(42);

      expect(result).toEqual(commandResult);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:7878/api/v3/command",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "MoviesSearch", movieIds: [42] }),
        })
      );
    });
  });

  describe("getMovieStatus", () => {
    it("uses filtered endpoint /movie?tmdbId=N", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await client.getMovieStatus(550);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:7878/api/v3/movie?tmdbId=550",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("returns not_found when movie not in Radarr", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      const result = await client.getMovieStatus(99999);

      expect(result).toEqual({ status: "not_found", label: "Not in Radarr" });
    });

    it("does not fetch queue when movie not found", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await client.getMovieStatus(99999);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("returns available when movie has file", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse([{ id: 42, tmdbId: 550, monitored: true, hasFile: true }])
      );
      mockFetch.mockResolvedValueOnce(jsonResponse({ totalRecords: 0, records: [] }));

      const result = await client.getMovieStatus(550);

      expect(result).toEqual({ status: "available", label: "Available" });
    });

    it("returns monitored when movie is monitored without file", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse([{ id: 42, tmdbId: 550, monitored: true, hasFile: false }])
      );
      mockFetch.mockResolvedValueOnce(jsonResponse({ totalRecords: 0, records: [] }));

      const result = await client.getMovieStatus(550);

      expect(result).toEqual({ status: "monitored", label: "Monitored" });
    });

    it("returns unmonitored when movie is not monitored and has no file", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse([{ id: 42, tmdbId: 550, monitored: false, hasFile: false }])
      );
      mockFetch.mockResolvedValueOnce(jsonResponse({ totalRecords: 0, records: [] }));

      const result = await client.getMovieStatus(550);

      expect(result).toEqual({ status: "unmonitored", label: "Unmonitored" });
    });

    it("returns downloading with progress when movie is in queue", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse([{ id: 42, tmdbId: 550, monitored: true, hasFile: false }])
      );
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          totalRecords: 1,
          records: [{ id: 1, movieId: 42, title: "Fight Club", size: 2000, sizeleft: 500 }],
        })
      );

      const result = await client.getMovieStatus(550);

      expect(result).toEqual({ status: "downloading", label: "Downloading 75%", progress: 75 });
    });

    it("returns 0% progress when queue item has zero size", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse([{ id: 42, tmdbId: 550, monitored: true, hasFile: false }])
      );
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          totalRecords: 1,
          records: [{ id: 1, movieId: 42, title: "Fight Club", size: 0, sizeleft: 0 }],
        })
      );

      const result = await client.getMovieStatus(550);

      expect(result).toEqual({ status: "downloading", label: "Downloading 0%", progress: 0 });
    });
  });
});
