/**
 * TheTVDB client + auth unit tests — all HTTP calls mocked via vi.stubGlobal("fetch").
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TheTvdbClient } from "./client.js";
import { TheTvdbAuth } from "./auth.js";
import { TvdbApiError } from "./types.js";

/** Helper to create a mocked Response. */
function mockResponse(body: unknown, status = 200, statusText = "OK"): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
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
    text: () => Promise.resolve(JSON.stringify(body)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

const FAKE_KEY = "test-thetvdb-api-key";
const FAKE_TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.fake-token";
const LOGIN_RESPONSE = { status: "success", data: { token: FAKE_TOKEN } };

let fetchMock: ReturnType<typeof vi.fn>;
let auth: TheTvdbAuth;
let client: TheTvdbClient;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  auth = new TheTvdbAuth(FAKE_KEY);
  client = new TheTvdbClient(auth);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Auth tests ---

describe("TheTvdbAuth", () => {
  it("throws if API key is empty", () => {
    expect(() => new TheTvdbAuth("")).toThrow("TheTVDB API key is required");
  });

  it("logs in and returns a token", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE));

    const token = await auth.getToken();

    expect(token).toBe(FAKE_TOKEN);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/login");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({ apikey: FAKE_KEY });
  });

  it("caches the token on subsequent calls", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE));

    await auth.getToken();
    const token2 = await auth.getToken();

    expect(token2).toBe(FAKE_TOKEN);
    // Only one fetch call — token was cached
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("re-authenticates after invalidate()", async () => {
    const FRESH_TOKEN = "fresh-token-abc";
    fetchMock
      .mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE))
      .mockResolvedValueOnce(mockResponse({ status: "success", data: { token: FRESH_TOKEN } }));

    await auth.getToken();
    auth.invalidate();
    const token = await auth.getToken();

    expect(token).toBe(FRESH_TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws TvdbApiError on login failure", async () => {
    expect.assertions(2);
    fetchMock.mockResolvedValueOnce(
      mockResponse({ message: "Invalid API key" }, 401, "Unauthorized")
    );

    try {
      await auth.getToken();
    } catch (err) {
      expect(err).toBeInstanceOf(TvdbApiError);
      expect((err as TvdbApiError).status).toBe(401);
    }
  });

  it("throws TvdbApiError on network error during login", async () => {
    expect.assertions(2);
    fetchMock.mockRejectedValueOnce(new Error("DNS resolution failed"));

    try {
      await auth.getToken();
    } catch (err) {
      expect(err).toBeInstanceOf(TvdbApiError);
      expect((err as TvdbApiError).message).toContain("Network error");
    }
  });
});

// --- Client tests ---

describe("TheTvdbClient.searchSeries", () => {
  const rawSearchResponse = {
    status: "success",
    data: [
      {
        tvdb_id: "81189",
        name: "Breaking Bad",
        overview: "A high school chemistry teacher...",
        first_air_time: "2008-01-20",
        status: "Ended",
        image_url: "https://artworks.thetvdb.com/banners/posters/81189-1.jpg",
        genres: ["Drama", "Thriller"],
        primary_language: "eng",
        year: "2008",
      },
      {
        objectID: "73255",
        name: "Better Call Saul",
        overview: null,
        first_air_time: null,
        status: "Ended",
        thumbnail: "https://artworks.thetvdb.com/banners/posters/73255.jpg",
        genres: [],
        primary_language: "eng",
        year: "2015",
      },
    ],
  };

  it("returns mapped search results", async () => {
    // Login + search
    fetchMock
      .mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE))
      .mockResolvedValueOnce(mockResponse(rawSearchResponse));

    const results = await client.searchSeries("breaking");

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      tvdbId: 81189,
      name: "Breaking Bad",
      originalName: null,
      overview: "A high school chemistry teacher...",
      firstAirDate: "2008-01-20",
      status: "Ended",
      posterPath: "https://artworks.thetvdb.com/banners/posters/81189-1.jpg",
      genres: ["Drama", "Thriller"],
      originalLanguage: "eng",
      year: "2008",
    });
  });

  it("handles missing fields with null defaults", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE))
      .mockResolvedValueOnce(mockResponse(rawSearchResponse));

    const results = await client.searchSeries("saul");

    expect(results[1].overview).toBeNull();
    expect(results[1].firstAirDate).toBeNull();
    // Falls back to thumbnail when image_url is missing
    expect(results[1].posterPath).toBe("https://artworks.thetvdb.com/banners/posters/73255.jpg");
  });

  it("passes query and type=series in URL", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE))
      .mockResolvedValueOnce(mockResponse({ status: "success", data: [] }));

    await client.searchSeries("breaking bad");

    const [url] = fetchMock.mock.calls[1] as [string];
    expect(url).toContain("q=breaking+bad");
    expect(url).toContain("type=series");
  });
});

describe("TheTvdbClient.getSeriesExtended", () => {
  const rawExtended = {
    status: "success",
    data: {
      id: 81189,
      name: "Breaking Bad",
      originalName: "Breaking Bad",
      overview: "A high school chemistry teacher...",
      firstAired: "2008-01-20",
      lastAired: "2013-09-29",
      status: { id: 2, name: "Ended" },
      originalLanguage: "eng",
      averageRuntime: 47,
      genres: [
        { id: 7, name: "Drama" },
        { id: 17, name: "Thriller" },
      ],
      networks: [{ id: 52, name: "AMC" }],
      seasons: [
        {
          id: 30272,
          number: 0,
          name: "Specials",
          overview: null,
          image: null,
          type: { id: 1, name: "Specials", type: "default" },
          episodes: [{ id: 1 }, { id: 2 }],
        },
        {
          id: 30273,
          number: 1,
          name: "Season 1",
          overview: "The first season.",
          image: "https://artworks.thetvdb.com/seasons/30273.jpg",
          type: { id: 1, name: "Season 1", type: "default" },
          episodes: [{ id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }, { id: 7 }, { id: 8 }, { id: 9 }],
        },
      ],
      artworks: [
        {
          id: 100,
          type: 2,
          image: "https://artworks.thetvdb.com/posters/81189-poster.jpg",
          language: "eng",
          score: 100,
        },
        {
          id: 101,
          type: 3,
          image: "https://artworks.thetvdb.com/backdrops/81189-bg.jpg",
          language: null,
          score: 85,
        },
      ],
    },
  };

  it("returns mapped show detail", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE))
      .mockResolvedValueOnce(mockResponse(rawExtended));

    const result = await client.getSeriesExtended(81189);

    expect(result.tvdbId).toBe(81189);
    expect(result.name).toBe("Breaking Bad");
    expect(result.status).toBe("Ended");
    expect(result.averageRuntime).toBe(47);
    expect(result.genres).toEqual([
      { id: 7, name: "Drama" },
      { id: 17, name: "Thriller" },
    ]);
    expect(result.networks).toEqual([{ id: 52, name: "AMC" }]);
  });

  it("maps seasons with episode counts", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE))
      .mockResolvedValueOnce(mockResponse(rawExtended));

    const result = await client.getSeriesExtended(81189);

    expect(result.seasons).toHaveLength(2);
    expect(result.seasons[0].tvdbId).toBe(30272);
    expect(result.seasons[0].seasonNumber).toBe(0);
    expect(result.seasons[0].episodeCount).toBe(2);
    expect(result.seasons[1].seasonNumber).toBe(1);
    expect(result.seasons[1].episodeCount).toBe(7);
    expect(result.seasons[1].imageUrl).toBe("https://artworks.thetvdb.com/seasons/30273.jpg");
  });

  it("maps artworks", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE))
      .mockResolvedValueOnce(mockResponse(rawExtended));

    const result = await client.getSeriesExtended(81189);

    expect(result.artworks).toHaveLength(2);
    expect(result.artworks[0]).toEqual({
      id: 100,
      type: 2,
      imageUrl: "https://artworks.thetvdb.com/posters/81189-poster.jpg",
      language: "eng",
      score: 100,
    });
  });

  it("calls correct URL", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE))
      .mockResolvedValueOnce(mockResponse(rawExtended));

    await client.getSeriesExtended(81189);

    const [url] = fetchMock.mock.calls[1] as [string];
    expect(url).toContain("/series/81189/extended");
  });
});

describe("TheTvdbClient.getSeriesEpisodes", () => {
  const rawEpisodes = {
    status: "success",
    data: {
      series: { id: 81189 },
      episodes: [
        {
          id: 349232,
          number: 1,
          seasonNumber: 1,
          name: "Pilot",
          overview: "Walter White, a chemistry teacher...",
          aired: "2008-01-20",
          runtime: 58,
          image: "https://artworks.thetvdb.com/episodes/349232.jpg",
        },
        {
          id: 349233,
          number: 2,
          seasonNumber: 1,
          name: "Cat's in the Bag...",
          overview: null,
          aired: "2008-01-27",
          runtime: 48,
          image: null,
        },
      ],
    },
  };

  it("returns mapped episodes", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE))
      .mockResolvedValueOnce(mockResponse(rawEpisodes));

    const episodes = await client.getSeriesEpisodes(81189, 1);

    expect(episodes).toHaveLength(2);
    expect(episodes[0]).toEqual({
      tvdbId: 349232,
      episodeNumber: 1,
      seasonNumber: 1,
      name: "Pilot",
      overview: "Walter White, a chemistry teacher...",
      airDate: "2008-01-20",
      runtime: 58,
      imageUrl: "https://artworks.thetvdb.com/episodes/349232.jpg",
    });
    expect(episodes[1].overview).toBeNull();
    expect(episodes[1].imageUrl).toBeNull();
  });

  it("calls correct URL with season parameter", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE))
      .mockResolvedValueOnce(mockResponse(rawEpisodes));

    await client.getSeriesEpisodes(81189, 1);

    const [url] = fetchMock.mock.calls[1] as [string];
    expect(url).toContain("/series/81189/episodes/default?season=1");
  });
});

describe("TheTvdbClient error handling", () => {
  it("throws TvdbApiError on 404", async () => {
    expect.assertions(2);
    fetchMock
      .mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE))
      .mockResolvedValueOnce(mockResponse({ message: "Record not found" }, 404, "Not Found"));

    try {
      await client.getSeriesExtended(999999);
    } catch (err) {
      expect(err).toBeInstanceOf(TvdbApiError);
      expect((err as TvdbApiError).status).toBe(404);
    }
  });

  it("retries once on 401 (re-authenticates)", async () => {
    const FRESH_TOKEN = "refreshed-token";
    fetchMock
      // Initial login
      .mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE))
      // First request → 401
      .mockResolvedValueOnce(mockResponse({ message: "Token expired" }, 401, "Unauthorized"))
      // Re-login
      .mockResolvedValueOnce(mockResponse({ status: "success", data: { token: FRESH_TOKEN } }))
      // Retry → success
      .mockResolvedValueOnce(mockResponse({ status: "success", data: [] }));

    const results = await client.searchSeries("test");

    expect(results).toEqual([]);
    // 4 fetch calls: login, 401, re-login, retry
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // Verify the retry used the new token
    const [, retryOptions] = fetchMock.mock.calls[3] as [string, RequestInit];
    expect((retryOptions.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${FRESH_TOKEN}`
    );
  });

  it("throws TvdbApiError on persistent 401 (does not retry infinitely)", async () => {
    expect.assertions(2);
    fetchMock
      // Initial login
      .mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE))
      // First request → 401
      .mockResolvedValueOnce(mockResponse({ message: "Unauthorized" }, 401, "Unauthorized"))
      // Re-login
      .mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE))
      // Retry → 401 again
      .mockResolvedValueOnce(mockResponse({ message: "Still unauthorized" }, 401, "Unauthorized"));

    try {
      await client.searchSeries("test");
    } catch (err) {
      expect(err).toBeInstanceOf(TvdbApiError);
      expect((err as TvdbApiError).status).toBe(401);
    }
  });

  it("throws TvdbApiError on network error", async () => {
    expect.assertions(3);
    fetchMock
      .mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE))
      .mockRejectedValueOnce(new Error("Connection refused"));

    try {
      await client.searchSeries("test");
    } catch (err) {
      expect(err).toBeInstanceOf(TvdbApiError);
      expect((err as TvdbApiError).status).toBe(0);
      expect((err as TvdbApiError).message).toContain("Connection refused");
    }
  });

  it("sends Bearer token in Authorization header", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE))
      .mockResolvedValueOnce(mockResponse({ status: "success", data: [] }));

    await client.searchSeries("test");

    const [, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((options.headers as Record<string, string>).Authorization).toBe(`Bearer ${FAKE_TOKEN}`);
  });
});
