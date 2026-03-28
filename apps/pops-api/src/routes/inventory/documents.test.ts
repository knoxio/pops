/**
 * Document thumbnail proxy endpoint tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";

// Mock the paperless client module
interface MockPaperlessClient {
  fetchThumbnail: ReturnType<typeof vi.fn>;
}
const mockGetPaperlessClient = vi.fn<() => MockPaperlessClient | null>();
vi.mock("../../modules/inventory/paperless/index.js", () => ({
  getPaperlessClient: (): MockPaperlessClient | null => mockGetPaperlessClient(),
}));

import documentsRouter from "./documents.js";

function createTestApp() {
  const app = express();
  app.use(documentsRouter);
  return app;
}

beforeEach(() => {
  mockGetPaperlessClient.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /inventory/documents/:id/thumbnail", () => {
  describe("parameter validation", () => {
    it("returns 400 for non-numeric id", async () => {
      const app = createTestApp();
      const res = await request(app).get("/inventory/documents/abc/thumbnail");
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid document id");
    });

    it("returns 400 for id with special characters", async () => {
      const app = createTestApp();
      const res = await request(app).get("/inventory/documents/12..3/thumbnail");
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid document id");
    });
  });

  describe("when paperless is not configured", () => {
    it("returns 503", async () => {
      mockGetPaperlessClient.mockReturnValue(null);
      const app = createTestApp();
      const res = await request(app).get("/inventory/documents/42/thumbnail");
      expect(res.status).toBe(503);
      expect(res.body.error).toContain("not configured");
    });
  });

  describe("when paperless is configured", () => {
    const mockFetchThumbnail = vi.fn();

    beforeEach(() => {
      mockGetPaperlessClient.mockReturnValue({
        fetchThumbnail: mockFetchThumbnail,
      });
    });

    it("proxies thumbnail image on success", async () => {
      const imageBuffer = Buffer.from("fake-image-data");
      mockFetchThumbnail.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "image/webp" }),
        arrayBuffer: () => Promise.resolve(imageBuffer.buffer),
      });

      const app = createTestApp();
      const res = await request(app).get("/inventory/documents/42/thumbnail");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("image/webp");
      expect(res.headers["cache-control"]).toBe("public, max-age=3600");
      expect(mockFetchThumbnail).toHaveBeenCalledWith(42);
    });

    it("returns 404 when document not found in Paperless", async () => {
      mockFetchThumbnail.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const app = createTestApp();
      const res = await request(app).get("/inventory/documents/999/thumbnail");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Document not found");
    });

    it("returns 502 when Paperless returns other error", async () => {
      mockFetchThumbnail.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const app = createTestApp();
      const res = await request(app).get("/inventory/documents/42/thumbnail");

      expect(res.status).toBe(502);
      expect(res.body.error).toContain("Failed to fetch thumbnail");
    });

    it("returns 502 when fetch throws a network error", async () => {
      const { PaperlessApiError } = await import("../../modules/inventory/paperless/types.js");
      mockFetchThumbnail.mockRejectedValue(new PaperlessApiError(0, "Network error: timeout"));

      const app = createTestApp();
      const res = await request(app).get("/inventory/documents/42/thumbnail");

      expect(res.status).toBe(502);
      expect(res.body.error).toContain("Paperless error");
    });

    it("defaults content-type to image/png when header missing", async () => {
      const imageBuffer = Buffer.from("fake-png-data");
      mockFetchThumbnail.mockResolvedValue({
        ok: true,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(imageBuffer.buffer),
      });

      const app = createTestApp();
      const res = await request(app).get("/inventory/documents/42/thumbnail");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("image/png");
    });
  });
});
