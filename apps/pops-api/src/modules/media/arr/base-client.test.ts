/**
 * Base *arr client tests — uses mocked fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ArrBaseClient } from "./base-client.js";
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

describe("ArrBaseClient", () => {
  let client: ArrBaseClient;

  beforeEach(() => {
    client = new ArrBaseClient("http://localhost:7878", "test-api-key");
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("testConnection returns system status", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ version: "5.1.0", appName: "Radarr" }));

    const result = await client.testConnection();

    expect(result.version).toBe("5.1.0");
    expect(result.appName).toBe("Radarr");
  });

  it("sends X-Api-Key header", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ version: "1.0", appName: "Test" }));

    await client.testConnection();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:7878/api/v3/system/status",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Api-Key": "test-api-key",
        }),
      })
    );
  });

  it("strips trailing slash from base URL", async () => {
    const c = new ArrBaseClient("http://localhost:7878/", "key");
    mockFetch.mockResolvedValueOnce(jsonResponse({ version: "1.0", appName: "Test" }));

    await c.testConnection();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("http://localhost:7878/api/v3/"),
      expect.anything()
    );
  });

  it("throws ArrApiError on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401, statusText: "Unauthorized" })
    );

    await expect(client.testConnection()).rejects.toThrow(ArrApiError);

    try {
      mockFetch.mockResolvedValueOnce(
        new Response("Unauthorized", {
          status: 401,
          statusText: "Unauthorized",
        })
      );
      await client.testConnection();
    } catch (err) {
      expect((err as ArrApiError).status).toBe(401);
    }
  });

  it("throws ArrApiError on 404", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Not Found", { status: 404, statusText: "Not Found" })
    );

    await expect(client.testConnection()).rejects.toThrow(ArrApiError);
  });
});
