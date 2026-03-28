/**
 * Plex client unit tests — all HTTP calls mocked via vi.stubGlobal("fetch").
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PlexClient } from "./client.js";
import { PlexApiError } from "./types.js";

/** Helper to create a mocked Response. */
function mockResponse(body: unknown, status = 200, statusText = "OK"): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
    redirected: false,
    type: "basic",
    url: "",
    clone: () => mockResponse(body, status, statusText),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

const PLEX_URL = "http://localhost:32400";
const PLEX_TOKEN = "test-plex-token-abc";

let client: PlexClient;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  client = new PlexClient(PLEX_URL, PLEX_TOKEN);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PlexClient constructor", () => {
  it("throws if base URL is empty", () => {
    expect(() => new PlexClient("", PLEX_TOKEN)).toThrow("Plex URL is required");
  });

  it("throws if token is empty", () => {
    expect(() => new PlexClient(PLEX_URL, "")).toThrow("Plex token is required");
  });

  it("strips trailing slash from base URL", () => {
    const c = new PlexClient("http://plex:32400/", PLEX_TOKEN);
    fetchMock.mockResolvedValueOnce(mockResponse({ MediaContainer: { size: 0, Directory: [] } }));
    void c.getLibraries();
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/^http:\/\/plex:32400\/library/);
  });
});

describe("PlexClient authentication", () => {
  it("sends X-Plex-Token as query parameter", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ MediaContainer: { size: 0, Directory: [] } }));

    await client.getLibraries();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain(`X-Plex-Token=${PLEX_TOKEN}`);
  });

  it("sends Accept: application/json header", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ MediaContainer: { size: 0, Directory: [] } }));

    await client.getLibraries();

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>).Accept).toBe("application/json");
  });
});

describe("getLibraries", () => {
  const rawLibraries = {
    MediaContainer: {
      size: 2,
      Directory: [
        {
          key: "1",
          title: "Movies",
          type: "movie",
          agent: "tv.plex.agents.movie",
          scanner: "Plex Movie",
          language: "en-US",
          uuid: "abc-123",
          updatedAt: 1711000000,
          scannedAt: 1711000100,
        },
        {
          key: "2",
          title: "TV Shows",
          type: "show",
          agent: "tv.plex.agents.series",
          scanner: "Plex TV Series",
          language: "en-US",
          uuid: "def-456",
          updatedAt: 1711000200,
          scannedAt: 1711000300,
        },
      ],
    },
  };

  it("returns mapped library list", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(rawLibraries));

    const result = await client.getLibraries();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      key: "1",
      title: "Movies",
      type: "movie",
      agent: "tv.plex.agents.movie",
      scanner: "Plex Movie",
      language: "en-US",
      uuid: "abc-123",
      updatedAt: 1711000000,
      scannedAt: 1711000100,
    });
    expect(result[1]!.title).toBe("TV Shows");
    expect(result[1]!.type).toBe("show");
  });

  it("calls correct URL", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(rawLibraries));

    await client.getLibraries();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/library/sections");
  });

  it("returns empty array when no libraries exist", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ MediaContainer: { size: 0, Directory: [] } }));

    const result = await client.getLibraries();
    expect(result).toEqual([]);
  });
});

describe("getAllItems", () => {
  const rawItems = {
    MediaContainer: {
      size: 1,
      totalSize: 1,
      Metadata: [
        {
          ratingKey: "100",
          key: "/library/metadata/100",
          guid: "plex://movie/abc",
          type: "movie",
          title: "Fight Club",
          originalTitle: "Fight Club",
          summary: "An insomniac office worker...",
          tagline: "Mischief. Mayhem. Soap.",
          year: 1999,
          thumb: "/library/metadata/100/thumb/1234",
          art: "/library/metadata/100/art/1234",
          duration: 8340000,
          addedAt: 1711000000,
          updatedAt: 1711000100,
          lastViewedAt: 1711500000,
          viewCount: 3,
          rating: 8.0,
          audienceRating: 8.8,
          contentRating: "R",
          Guid: [{ id: "tmdb://550" }, { id: "imdb://tt0137523" }],
          Genre: [{ tag: "Drama" }, { tag: "Thriller" }],
          Director: [{ tag: "David Fincher" }],
        },
      ],
    },
  };

  it("requests includeGuids=1 to get external IDs", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(rawItems));

    await client.getAllItems("1");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/library/sections/1/all");
    expect(url).toContain("includeGuids=1");
  });

  it("returns mapped media items", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(rawItems));

    const result = await client.getAllItems("1");

    expect(result).toHaveLength(1);
    const item = result[0];
    expect(item!.ratingKey).toBe("100");
    expect(item!.title).toBe("Fight Club");
    expect(item!.originalTitle).toBe("Fight Club");
    expect(item!.summary).toBe("An insomniac office worker...");
    expect(item!.tagline).toBe("Mischief. Mayhem. Soap.");
    expect(item!.year).toBe(1999);
    expect(item!.durationMs).toBe(8340000);
    expect(item!.viewCount).toBe(3);
    expect(item!.lastViewedAt).toBe(1711500000);
    expect(item!.rating).toBe(8.0);
    expect(item!.audienceRating).toBe(8.8);
    expect(item!.contentRating).toBe("R");
    expect(item!.genres).toEqual(["Drama", "Thriller"]);
    expect(item!.directors).toEqual(["David Fincher"]);
  });

  it("parses external IDs from Guid array", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(rawItems));

    const result = await client.getAllItems("1");

    expect(result[0]!.externalIds).toEqual([
      { source: "tmdb", id: "550" },
      { source: "imdb", id: "tt0137523" },
    ]);
  });

  it("handles items with no Guid, Genre, or Director", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        MediaContainer: {
          size: 1,
          Metadata: [
            {
              ratingKey: "200",
              key: "/library/metadata/200",
              guid: "plex://movie/xyz",
              type: "movie",
              title: "Unknown Movie",
              addedAt: 1711000000,
              updatedAt: 1711000000,
            },
          ],
        },
      })
    );

    const result = await client.getAllItems("1");
    const item = result[0];
    expect(item!.externalIds).toEqual([]);
    expect(item!.genres).toEqual([]);
    expect(item!.directors).toEqual([]);
    expect(item!.originalTitle).toBeNull();
    expect(item!.summary).toBeNull();
    expect(item!.year).toBeNull();
    expect(item!.viewCount).toBe(0);
    expect(item!.lastViewedAt).toBeNull();
  });

  it("returns empty array when section has no items", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ MediaContainer: { size: 0 } }));

    const result = await client.getAllItems("1");
    expect(result).toEqual([]);
  });

  it("calls correct URL with section ID", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ MediaContainer: { size: 0 } }));

    await client.getAllItems("3");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/library/sections/3/all");
  });
});

describe("getItemDetail", () => {
  it("returns mapped detail for a single item", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        MediaContainer: {
          size: 1,
          Metadata: [
            {
              ratingKey: "100",
              key: "/library/metadata/100",
              guid: "plex://movie/abc",
              type: "movie",
              title: "Fight Club",
              year: 1999,
              addedAt: 1711000000,
              updatedAt: 1711000100,
              Guid: [{ id: "tmdb://550" }],
            },
          ],
        },
      })
    );

    const result = await client.getItemDetail("100");

    expect(result.ratingKey).toBe("100");
    expect(result.title).toBe("Fight Club");
    expect(result.externalIds).toEqual([{ source: "tmdb", id: "550" }]);
  });

  it("throws PlexApiError when item not found (empty metadata)", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ MediaContainer: { size: 0 } }));

    await expect(client.getItemDetail("999")).rejects.toThrow(PlexApiError);

    fetchMock.mockResolvedValueOnce(mockResponse({ MediaContainer: { size: 0 } }));

    try {
      await client.getItemDetail("999");
    } catch (err) {
      expect(err).toBeInstanceOf(PlexApiError);
      expect((err as PlexApiError).status).toBe(404);
      expect((err as PlexApiError).message).toContain("999");
    }
  });

  it("calls correct URL", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        MediaContainer: {
          size: 1,
          Metadata: [
            {
              ratingKey: "42",
              key: "/library/metadata/42",
              guid: "plex://movie/x",
              type: "movie",
              title: "Test",
              addedAt: 0,
              updatedAt: 0,
            },
          ],
        },
      })
    );

    await client.getItemDetail("42");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/library/metadata/42");
  });
});

describe("getEpisodes", () => {
  const rawEpisodes = {
    MediaContainer: {
      size: 2,
      Metadata: [
        {
          ratingKey: "501",
          key: "/library/metadata/501",
          parentRatingKey: "500",
          grandparentRatingKey: "400",
          type: "episode",
          title: "Pilot",
          index: 1,
          parentIndex: 1,
          summary: "The beginning...",
          thumb: "/library/metadata/501/thumb/1234",
          duration: 3600000,
          addedAt: 1711000000,
          updatedAt: 1711000100,
          lastViewedAt: 1711500000,
          viewCount: 2,
        },
        {
          ratingKey: "502",
          key: "/library/metadata/502",
          parentRatingKey: "500",
          grandparentRatingKey: "400",
          type: "episode",
          title: "Cat's in the Bag...",
          index: 2,
          parentIndex: 1,
          addedAt: 1711000200,
          updatedAt: 1711000300,
        },
      ],
    },
  };

  it("returns mapped episodes", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(rawEpisodes));

    const result = await client.getEpisodes("400");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      ratingKey: "501",
      title: "Pilot",
      episodeIndex: 1,
      seasonIndex: 1,
      summary: "The beginning...",
      thumbUrl: "/library/metadata/501/thumb/1234",
      durationMs: 3600000,
      addedAt: 1711000000,
      updatedAt: 1711000100,
      lastViewedAt: 1711500000,
      viewCount: 2,
    });
    expect(result[1]!.title).toBe("Cat's in the Bag...");
    expect(result[1]!.viewCount).toBe(0);
    expect(result[1]!.lastViewedAt).toBeNull();
    expect(result[1]!.summary).toBeNull();
  });

  it("calls correct URL with allLeaves", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ MediaContainer: { size: 0 } }));

    await client.getEpisodes("400");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/library/metadata/400/allLeaves");
  });

  it("returns empty array when show has no episodes", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ MediaContainer: { size: 0 } }));

    const result = await client.getEpisodes("400");
    expect(result).toEqual([]);
  });
});

describe("getEpisodes - TV show with TVDB guid", () => {
  it("parses tvdb external ID", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        MediaContainer: {
          size: 1,
          Metadata: [
            {
              ratingKey: "300",
              key: "/library/metadata/300",
              guid: "plex://show/xyz",
              type: "show",
              title: "Breaking Bad",
              year: 2008,
              addedAt: 1711000000,
              updatedAt: 1711000100,
              Guid: [{ id: "tvdb://81189" }, { id: "tmdb://1396" }, { id: "imdb://tt0903747" }],
              leafCount: 62,
              viewedLeafCount: 62,
              childCount: 5,
            },
          ],
        },
      })
    );

    const result = await client.getAllItems("2");

    expect(result[0]!.externalIds).toEqual([
      { source: "tvdb", id: "81189" },
      { source: "tmdb", id: "1396" },
      { source: "imdb", id: "tt0903747" },
    ]);
    expect(result[0]!.leafCount).toBe(62);
    expect(result[0]!.viewedLeafCount).toBe(62);
    expect(result[0]!.childCount).toBe(5);
  });
});

describe("error handling", () => {
  it("throws PlexApiError on 401 unauthorized", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse("Unauthorized", 401, "Unauthorized"));

    await expect(client.getLibraries()).rejects.toThrow(PlexApiError);

    fetchMock.mockResolvedValueOnce(mockResponse("Unauthorized", 401, "Unauthorized"));

    try {
      await client.getLibraries();
    } catch (err) {
      expect(err).toBeInstanceOf(PlexApiError);
      expect((err as PlexApiError).status).toBe(401);
    }
  });

  it("throws PlexApiError on 500 server error", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse("Internal Server Error", 500, "Internal Server Error")
    );

    await expect(client.getLibraries()).rejects.toThrow(PlexApiError);
  });

  it("throws PlexApiError on network error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(client.getLibraries()).rejects.toThrow(PlexApiError);

    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    try {
      await client.getLibraries();
    } catch (err) {
      expect(err).toBeInstanceOf(PlexApiError);
      expect((err as PlexApiError).status).toBe(0);
      expect((err as PlexApiError).message).toContain("Network error");
      expect((err as PlexApiError).message).toContain("ECONNREFUSED");
    }
  });
});

describe("external ID parsing", () => {
  it("handles malformed guid strings gracefully", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        MediaContainer: {
          size: 1,
          Metadata: [
            {
              ratingKey: "300",
              key: "/library/metadata/300",
              guid: "plex://movie/x",
              type: "movie",
              title: "Test",
              addedAt: 0,
              updatedAt: 0,
              Guid: [
                { id: "tmdb://550" },
                { id: "invalid-no-protocol" },
                { id: "imdb://tt0137523" },
              ],
            },
          ],
        },
      })
    );

    const result = await client.getAllItems("1");
    expect(result[0]!.externalIds).toEqual([
      { source: "tmdb", id: "550" },
      { source: "imdb", id: "tt0137523" },
    ]);
  });
});
