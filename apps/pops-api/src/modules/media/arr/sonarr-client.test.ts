/**
 * Sonarr client tests — uses mocked fetch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SonarrClient } from "./sonarr-client.js";

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
    client = new SonarrClient("http://localhost:8989", "sonarr-key");
    mockFetch.mockReset();
  });

  it("getQualityProfiles returns typed profiles", async () => {
    const profiles = [
      { id: 1, name: "HD-1080p" },
      { id: 4, name: "Ultra-HD" },
    ];
    mockFetch.mockResolvedValueOnce(jsonResponse(profiles));

    const result = await client.getQualityProfiles();

    expect(result).toEqual(profiles);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8989/api/v3/qualityprofile",
      expect.anything()
    );
  });

  it("getRootFolders returns folders with free space", async () => {
    const folders = [
      { id: 1, path: "/tv", freeSpace: 500000000000 },
      { id: 2, path: "/tv-4k", freeSpace: 200000000000 },
    ];
    mockFetch.mockResolvedValueOnce(jsonResponse(folders));

    const result = await client.getRootFolders();

    expect(result).toEqual(folders);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8989/api/v3/rootfolder",
      expect.anything()
    );
  });

  it("getLanguageProfiles returns language options", async () => {
    const profiles = [
      { id: 1, name: "English" },
      { id: 2, name: "Any" },
    ];
    mockFetch.mockResolvedValueOnce(jsonResponse(profiles));

    const result = await client.getLanguageProfiles();

    expect(result).toEqual(profiles);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8989/api/v3/languageprofile",
      expect.anything()
    );
  });

  it("checkSeries returns exists=true with details when series found", async () => {
    const series = [
      {
        id: 42,
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
    mockFetch.mockResolvedValueOnce(jsonResponse(series));

    const result = await client.checkSeries(81189);

    expect(result).toEqual({ exists: true, sonarrId: 42, monitored: true });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8989/api/v3/series?tvdbId=81189",
      expect.anything()
    );
  });

  it("checkSeries returns exists=false when series not found", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    const result = await client.checkSeries(99999);

    expect(result).toEqual({ exists: false });
  });

  it("getCalendar passes date range to API", async () => {
    const entries = [
      {
        seriesId: 1,
        seriesTitle: "The Mandalorian",
        episodeTitle: "Chapter 1",
        seasonNumber: 1,
        episodeNumber: 1,
        airDateUtc: "2026-04-01T00:00:00Z",
        hasFile: false,
      },
    ];
    mockFetch.mockResolvedValueOnce(jsonResponse(entries));

    const result = await client.getCalendar("2026-04-01", "2026-04-07");

    expect(result).toEqual(entries);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8989/api/v3/calendar?start=2026-04-01&end=2026-04-07&includeSeries=true",
      expect.anything()
    );
  });

  it("getCalendar returns empty array when no episodes", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    const result = await client.getCalendar("2026-01-01", "2026-01-07");

    expect(result).toEqual([]);
  });

  it("throws ArrApiError on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401, statusText: "Unauthorized" })
    );

    await expect(client.getQualityProfiles()).rejects.toThrow("401 Unauthorized");
  });

  it("getShowStatus returns not_found for unknown TVDB ID", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([])) // getSeries
      .mockResolvedValueOnce(jsonResponse({ totalRecords: 0, records: [] })); // getQueue

    const result = await client.getShowStatus(99999);

    expect(result.status).toBe("not_found");
  });

  it("getShowStatus returns complete when all episodes have files", async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: 1,
            title: "Test Show",
            tvdbId: 12345,
            monitored: true,
            statistics: {
              episodeFileCount: 10,
              episodeCount: 10,
              totalEpisodeCount: 10,
              percentOfEpisodes: 100,
            },
          },
        ])
      )
      .mockResolvedValueOnce(jsonResponse({ totalRecords: 0, records: [] }));

    const result = await client.getShowStatus(12345);

    expect(result.status).toBe("complete");
  });
});
