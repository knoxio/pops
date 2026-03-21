/**
 * Arr service tests — tests client factory and status caching.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getRadarrClient, getSonarrClient, getArrConfig, clearStatusCache } from "./service.js";

describe("Arr service", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearStatusCache();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("getRadarrClient", () => {
    it("returns null when RADARR_URL is not set", () => {
      delete process.env["RADARR_URL"];
      delete process.env["RADARR_API_KEY"];
      expect(getRadarrClient()).toBeNull();
    });

    it("returns null when RADARR_API_KEY is not set", () => {
      process.env["RADARR_URL"] = "http://localhost:7878";
      delete process.env["RADARR_API_KEY"];
      expect(getRadarrClient()).toBeNull();
    });

    it("returns a client when both env vars are set", () => {
      process.env["RADARR_URL"] = "http://localhost:7878";
      process.env["RADARR_API_KEY"] = "test-key";
      const client = getRadarrClient();
      expect(client).not.toBeNull();
    });
  });

  describe("getSonarrClient", () => {
    it("returns null when SONARR_URL is not set", () => {
      delete process.env["SONARR_URL"];
      delete process.env["SONARR_API_KEY"];
      expect(getSonarrClient()).toBeNull();
    });

    it("returns null when SONARR_API_KEY is not set", () => {
      process.env["SONARR_URL"] = "http://localhost:8989";
      delete process.env["SONARR_API_KEY"];
      expect(getSonarrClient()).toBeNull();
    });

    it("returns a client when both env vars are set", () => {
      process.env["SONARR_URL"] = "http://localhost:8989";
      process.env["SONARR_API_KEY"] = "test-key";
      const client = getSonarrClient();
      expect(client).not.toBeNull();
    });
  });

  describe("getArrConfig", () => {
    it("reports both unconfigured when no env vars set", () => {
      delete process.env["RADARR_URL"];
      delete process.env["RADARR_API_KEY"];
      delete process.env["SONARR_URL"];
      delete process.env["SONARR_API_KEY"];

      const config = getArrConfig();
      expect(config.radarrConfigured).toBe(false);
      expect(config.sonarrConfigured).toBe(false);
    });

    it("reports radarr configured when env vars set", () => {
      process.env["RADARR_URL"] = "http://localhost:7878";
      process.env["RADARR_API_KEY"] = "test-key";
      delete process.env["SONARR_URL"];
      delete process.env["SONARR_API_KEY"];

      const config = getArrConfig();
      expect(config.radarrConfigured).toBe(true);
      expect(config.sonarrConfigured).toBe(false);
    });

    it("reports both configured when all env vars set", () => {
      process.env["RADARR_URL"] = "http://localhost:7878";
      process.env["RADARR_API_KEY"] = "radarr-key";
      process.env["SONARR_URL"] = "http://localhost:8989";
      process.env["SONARR_API_KEY"] = "sonarr-key";

      const config = getArrConfig();
      expect(config.radarrConfigured).toBe(true);
      expect(config.sonarrConfigured).toBe(true);
    });
  });
});
