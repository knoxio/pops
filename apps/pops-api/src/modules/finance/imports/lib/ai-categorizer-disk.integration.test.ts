import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Integration tests for AI categorizer disk cache persistence.
 * Uses a real temp directory to verify read/write to ai_entity_cache.json.
 */

// Mock the Anthropic SDK
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

// Mock the database
const mockDbRun = vi.fn();
vi.mock("../../../../db.js", () => ({
  getDrizzle: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ run: mockDbRun })),
    })),
  })),
  isNamedEnvContext: vi.fn().mockReturnValue(false),
}));

let tmpDir: string;
let cachePath: string;
const originalEnv = {
  CLAUDE_API_KEY: process.env["CLAUDE_API_KEY"],
  AI_CACHE_PATH: process.env["AI_CACHE_PATH"],
};

beforeEach(async () => {
  tmpDir = join(
    tmpdir(),
    `pops-ai-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(tmpDir, { recursive: true });
  cachePath = join(tmpDir, "ai_entity_cache.json");
  process.env["AI_CACHE_PATH"] = cachePath;
  process.env["CLAUDE_API_KEY"] = "test-key";
  mockCreate.mockClear();
  mockDbRun.mockClear();

  // Dynamic import + clearCache to reset state between tests
  const mod = await import("./ai-categorizer.js");
  mod.clearCache();
});

afterEach(() => {
  if (originalEnv.CLAUDE_API_KEY === undefined) delete process.env["CLAUDE_API_KEY"];
  else process.env["CLAUDE_API_KEY"] = originalEnv.CLAUDE_API_KEY;

  if (originalEnv.AI_CACHE_PATH === undefined) delete process.env["AI_CACHE_PATH"];
  else process.env["AI_CACHE_PATH"] = originalEnv.AI_CACHE_PATH;

  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

describe("AI categorizer disk cache", () => {
  it("writes cache to disk after a successful API call", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"entityName": "Woolworths", "category": "Groceries"}' }],
      usage: { input_tokens: 50, output_tokens: 20 },
    });

    const { categorizeWithAi } = await import("./ai-categorizer.js");
    await categorizeWithAi("WOOLWORTHS 1234");

    expect(existsSync(cachePath)).toBe(true);
    const data = JSON.parse(readFileSync(cachePath, "utf-8"));
    expect(data).toHaveLength(1);
    expect(data[0]!.entityName).toBe("Woolworths");
    expect(data[0]!.category).toBe("Groceries");
  });

  it("loads cache from disk on first access after clearCache", async () => {
    // Pre-populate the cache file
    const entries = [
      {
        description: "NETFLIX.COM",
        entityName: "Netflix",
        category: "Subscriptions",
        cachedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    writeFileSync(cachePath, JSON.stringify(entries, null, 2));

    const mod = await import("./ai-categorizer.js");
    mod.clearCache(); // Reset so it reloads from disk

    // This should be a cache hit from disk — no API call
    const { result } = await mod.categorizeWithAi("NETFLIX.COM");

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result?.entityName).toBe("Netflix");
    expect(result?.category).toBe("Subscriptions");
  });

  it("handles corrupted cache file gracefully", async () => {
    writeFileSync(cachePath, "not valid json {{{");

    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"entityName": "Test", "category": "Other"}' }],
      usage: { input_tokens: 50, output_tokens: 20 },
    });

    const mod = await import("./ai-categorizer.js");
    mod.clearCache();

    // Should not throw — falls back to empty cache and calls API
    const { result } = await mod.categorizeWithAi("TEST");
    expect(result?.entityName).toBe("Test");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("handles missing cache file gracefully", async () => {
    // No file at cachePath
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"entityName": "Test", "category": "Other"}' }],
      usage: { input_tokens: 50, output_tokens: 20 },
    });

    const mod = await import("./ai-categorizer.js");
    mod.clearCache();

    const { result } = await mod.categorizeWithAi("TEST");
    expect(result?.entityName).toBe("Test");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
