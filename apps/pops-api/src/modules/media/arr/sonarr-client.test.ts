/**
 * Sonarr client tests — uses mocked fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SonarrClient } from "./sonarr-client.js";
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

describe("SonarrClient", () => {
  let client: SonarrClient;

  beforeEach(() => {
    client = new SonarrClient("http://localhost:8989", "test-api-key");
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
        "http://localhost:8989/api/v3/qualityprofile",
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
        { id: 1, path: "/tv", freeSpace: 500000000000 },
        { id: 2, path: "/tv-4k", freeSpace: 200000000000 },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse(folders));

      const result = await client.getRootFolders();

      expect(result).toEqual(folders);
      expect(result[0]?.freeSpace).toBe(500000000000);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8989/api/v3/rootfolder",
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  describe("getLanguageProfiles", () => {
    it("returns typed language profiles", async () => {
      const profiles = [
        { id: 1, name: "English" },
        { id: 2, name: "Japanese" },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse(profiles));

      const result = await client.getLanguageProfiles();

      expect(result).toEqual(profiles);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8989/api/v3/languageprofile",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("throws ArrApiError on 401", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401, statusText: "Unauthorized" })
      );

      await expect(client.getLanguageProfiles()).rejects.toThrow(ArrApiError);
    });
  });

  describe("checkSeries", () => {
    it("returns exists: true with sonarrId, monitored, and seasons when found", async () => {
      const allSeries = [
        {
          id: 10,
          title: "Breaking Bad",
          tvdbId: 81189,
          monitored: true,
          statistics: {
            episodeFileCount: 62,
            episodeCount: 62,
            totalEpisodeCount: 62,
            percentOfEpisodes: 100,
          },
        },
      ];
      const fullSeries = {
        ...allSeries[0],
        seasons: [
          { seasonNumber: 1, monitored: true },
          { seasonNumber: 2, monitored: false },
        ],
      };
      // First call: GET /series (getSeries)
      mockFetch.mockResolvedValueOnce(jsonResponse(allSeries));
      // Second call: GET /series/10 (full series)
      mockFetch.mockResolvedValueOnce(jsonResponse(fullSeries));

      const result = await client.checkSeries(81189);

      expect(result).toEqual({
        exists: true,
        sonarrId: 10,
        monitored: true,
        seasons: [
          { seasonNumber: 1, monitored: true },
          { seasonNumber: 2, monitored: false },
        ],
      });
    });

    it("returns exists: false when series not found", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      const result = await client.checkSeries(99999);

      expect(result).toEqual({ exists: false });
    });
  });

  describe("addSeries", () => {
    it("sends correct payload including season monitoring array", async () => {
      const createdSeries = {
        id: 10,
        title: "Breaking Bad",
        tvdbId: 81189,
        monitored: true,
        statistics: {
          episodeFileCount: 0,
          episodeCount: 62,
          totalEpisodeCount: 62,
          percentOfEpisodes: 0,
        },
        seasons: [
          { seasonNumber: 1, monitored: true },
          { seasonNumber: 2, monitored: true },
        ],
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(createdSeries));

      const result = await client.addSeries({
        tvdbId: 81189,
        title: "Breaking Bad",
        qualityProfileId: 1,
        rootFolderPath: "/tv",
        languageProfileId: 1,
        seasons: [
          { seasonNumber: 1, monitored: true },
          { seasonNumber: 2, monitored: true },
        ],
      });

      expect(result).toEqual(createdSeries);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8989/api/v3/series",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            tvdbId: 81189,
            title: "Breaking Bad",
            qualityProfileId: 1,
            rootFolderPath: "/tv",
            languageProfileId: 1,
            seasons: [
              { seasonNumber: 1, monitored: true },
              { seasonNumber: 2, monitored: true },
            ],
            monitored: true,
            addOptions: { searchForMissingEpisodes: false },
          }),
        })
      );
    });

    it("throws ArrApiError on 401", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401, statusText: "Unauthorized" })
      );

      await expect(
        client.addSeries({
          tvdbId: 1,
          title: "X",
          qualityProfileId: 1,
          rootFolderPath: "/tv",
          languageProfileId: 1,
          seasons: [],
        })
      ).rejects.toThrow(ArrApiError);
    });
  });

  describe("updateMonitoring", () => {
    it("fetches series, merges monitored flag, and PUTs full object", async () => {
      const existingSeries = {
        id: 10,
        title: "Breaking Bad",
        tvdbId: 81189,
        monitored: true,
        statistics: {
          episodeFileCount: 62,
          episodeCount: 62,
          totalEpisodeCount: 62,
          percentOfEpisodes: 100,
        },
        seasons: [{ seasonNumber: 1, monitored: true }],
      };
      const updatedSeries = { ...existingSeries, monitored: false };

      // First call: GET series
      mockFetch.mockResolvedValueOnce(jsonResponse(existingSeries));
      // Second call: PUT series
      mockFetch.mockResolvedValueOnce(jsonResponse(updatedSeries));

      const result = await client.updateMonitoring(10, false);

      expect(result.monitored).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "http://localhost:8989/api/v3/series/10",
        expect.objectContaining({ method: "GET" })
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "http://localhost:8989/api/v3/series/10",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ ...existingSeries, monitored: false }),
        })
      );
    });
  });

  describe("updateSeasonMonitoring", () => {
    it("fetches series, updates target season, and PUTs back", async () => {
      const existingSeries = {
        id: 10,
        title: "Breaking Bad",
        tvdbId: 81189,
        monitored: true,
        statistics: {
          episodeFileCount: 62,
          episodeCount: 62,
          totalEpisodeCount: 62,
          percentOfEpisodes: 100,
        },
        seasons: [
          { seasonNumber: 1, monitored: true },
          { seasonNumber: 2, monitored: false },
        ],
      };
      const updatedSeries = {
        ...existingSeries,
        seasons: [
          { seasonNumber: 1, monitored: true },
          { seasonNumber: 2, monitored: true },
        ],
      };

      mockFetch.mockResolvedValueOnce(jsonResponse(existingSeries));
      mockFetch.mockResolvedValueOnce(jsonResponse(updatedSeries));

      const result = await client.updateSeasonMonitoring(10, 2, true);

      expect(result.seasons[1]?.monitored).toBe(true);
    });

    it("throws when season not found", async () => {
      const series = {
        id: 10,
        title: "Breaking Bad",
        tvdbId: 81189,
        monitored: true,
        statistics: {
          episodeFileCount: 0,
          episodeCount: 0,
          totalEpisodeCount: 0,
          percentOfEpisodes: 0,
        },
        seasons: [{ seasonNumber: 1, monitored: true }],
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(series));

      await expect(client.updateSeasonMonitoring(10, 99, true)).rejects.toThrow(
        "Season 99 not found"
      );
    });
  });

  describe("triggerSearch", () => {
    it("sends SeriesSearch command when no seasonNumber", async () => {
      const commandResult = { id: 1, name: "SeriesSearch", status: "started" };
      mockFetch.mockResolvedValueOnce(jsonResponse(commandResult));

      const result = await client.triggerSearch(10);

      expect(result).toEqual(commandResult);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8989/api/v3/command",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "SeriesSearch", seriesId: 10 }),
        })
      );
    });

    it("sends SeasonSearch command when seasonNumber provided", async () => {
      const commandResult = { id: 2, name: "SeasonSearch", status: "started" };
      mockFetch.mockResolvedValueOnce(jsonResponse(commandResult));

      const result = await client.triggerSearch(10, 3);

      expect(result).toEqual(commandResult);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8989/api/v3/command",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "SeasonSearch", seriesId: 10, seasonNumber: 3 }),
        })
      );
    });
  });

  describe("getShowStatus", () => {
    const baseSeries = {
      id: 10,
      title: "Breaking Bad",
      tvdbId: 81189,
      monitored: true,
      statistics: {
        episodeFileCount: 62,
        episodeCount: 62,
        totalEpisodeCount: 62,
        percentOfEpisodes: 100,
      },
    };

    it("returns not_found when series not in Sonarr", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([])); // getSeries
      mockFetch.mockResolvedValueOnce(jsonResponse({ totalRecords: 0, records: [] })); // getQueue

      const result = await client.getShowStatus(99999);
      expect(result).toEqual({ status: "not_found", label: "Not in Sonarr" });
    });

    it("returns complete when all episodes available", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([baseSeries]));
      mockFetch.mockResolvedValueOnce(jsonResponse({ totalRecords: 0, records: [] }));

      const result = await client.getShowStatus(81189);
      expect(result).toEqual({ status: "complete", label: "Complete" });
    });

    it("returns partial when some episodes available", async () => {
      const partialSeries = {
        ...baseSeries,
        statistics: {
          episodeFileCount: 30,
          episodeCount: 62,
          totalEpisodeCount: 62,
          percentOfEpisodes: 48,
        },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse([partialSeries]));
      mockFetch.mockResolvedValueOnce(jsonResponse({ totalRecords: 0, records: [] }));

      const result = await client.getShowStatus(81189);
      expect(result.status).toBe("partial");
      expect(result.episodeStats).toBe("30/62 episodes");
    });

    it("returns downloading when in queue", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([baseSeries]));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          totalRecords: 1,
          records: [
            {
              id: 1,
              seriesId: 10,
              title: "Breaking Bad",
              status: "downloading",
              sizeleft: 500,
              size: 1000,
              episode: { title: "Pilot", seasonNumber: 1, episodeNumber: 1 },
            },
          ],
        })
      );

      const result = await client.getShowStatus(81189);
      expect(result.status).toBe("downloading");
      expect(result.label).toContain("S01E01");
    });
  });
});
