import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../env.js", () => ({
  getEnv: vi.fn(),
}));

import { validateTvdbApiKey, getTvdbClient, setTvdbClient } from "./index.js";
import { getEnv } from "../../../env.js";

const mockGetEnv = vi.mocked(getEnv);

beforeEach(() => {
  vi.clearAllMocks();
  setTvdbClient(null);
});

describe("validateTvdbApiKey", () => {
  it("throws when THETVDB_API_KEY is not set", () => {
    mockGetEnv.mockReturnValue(undefined);

    expect(() => validateTvdbApiKey()).toThrow("THETVDB_API_KEY is not configured");
  });

  it("does not throw when THETVDB_API_KEY is set", () => {
    mockGetEnv.mockReturnValue("test-api-key-123");

    expect(() => validateTvdbApiKey()).not.toThrow();
  });

  it("throws with helpful message mentioning .env and Docker secrets", () => {
    mockGetEnv.mockReturnValue(undefined);

    expect(() => validateTvdbApiKey()).toThrow(/\.env.*Docker secrets/);
  });
});

describe("getTvdbClient", () => {
  it("throws when API key is missing", () => {
    mockGetEnv.mockReturnValue(undefined);

    expect(() => getTvdbClient()).toThrow("THETVDB_API_KEY is not configured");
  });

  it("creates client when API key is present", () => {
    mockGetEnv.mockReturnValue("test-api-key-123");

    const client = getTvdbClient();
    expect(client).toBeDefined();
  });

  it("returns same client instance on subsequent calls", () => {
    mockGetEnv.mockReturnValue("test-api-key-123");

    const client1 = getTvdbClient();
    const client2 = getTvdbClient();
    expect(client1).toBe(client2);
  });
});
