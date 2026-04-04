import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SearchContext } from "../search/types.js";

const mockAll = vi.fn().mockReturnValue([]);

vi.mock("../../../db.js", () => ({
  getDrizzle: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ all: mockAll }),
        all: mockAll,
      }),
    }),
  }),
}));

// Prevent side-effect registration from throwing in subsequent imports
vi.mock("../search/registry.js", () => ({
  registerSearchAdapter: vi.fn(),
  getAdapters: vi.fn(),
  resetRegistry: vi.fn(),
}));

import { entitiesSearchAdapter, type EntityHitData } from "./search-adapter.js";
import { registerSearchAdapter } from "../search/registry.js";
import type { SearchHit } from "../search/types.js";

const ctx: SearchContext = { app: "finance", page: "entities" };

/** Helper — adapter is synchronous so we can safely cast. */
function search(text: string, options?: { limit?: number }): SearchHit<EntityHitData>[] {
  return entitiesSearchAdapter.search({ text }, ctx, options) as SearchHit<EntityHitData>[];
}

beforeEach(() => {
  mockAll.mockReset().mockReturnValue([]);
});

describe("entities search adapter", () => {
  it("registers with correct domain, icon, and color", () => {
    expect(entitiesSearchAdapter.domain).toBe("entities");
    expect(entitiesSearchAdapter.icon).toBe("Building2");
    expect(entitiesSearchAdapter.color).toBe("green");
    expect(registerSearchAdapter).toHaveBeenCalledWith(entitiesSearchAdapter);
  });

  it("returns empty array for empty query", () => {
    const hits = search("  ");
    expect(hits).toEqual([]);
    expect(mockAll).not.toHaveBeenCalled();
  });

  it("returns exact match with score 1.0", () => {
    mockAll.mockReturnValueOnce([{ id: "e1", name: "Woolworths", type: "company", aliases: null }]);

    const hits = search("Woolworths");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      uri: "pops:finance/entity/e1",
      score: 1.0,
      matchField: "name",
      matchType: "exact",
      data: { name: "Woolworths", type: "company", aliases: [] },
    });
  });

  it("returns prefix match with score 0.8", () => {
    mockAll.mockReturnValueOnce([
      { id: "e2", name: "Woolworths Group", type: "company", aliases: "Woolies" },
    ]);

    const hits = search("Woolworths");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      score: 0.8,
      matchType: "prefix",
      data: { name: "Woolworths Group", type: "company", aliases: ["Woolies"] },
    });
  });

  it("returns contains match with score 0.5", () => {
    mockAll.mockReturnValueOnce([
      { id: "e3", name: "JB Hi-Fi", type: "company", aliases: "JB, Hi-Fi" },
    ]);

    const hits = search("Hi-Fi");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      score: 0.5,
      matchType: "contains",
      data: { name: "JB Hi-Fi", aliases: ["JB", "Hi-Fi"] },
    });
  });

  it("sorts hits by score descending", () => {
    mockAll.mockReturnValueOnce([
      { id: "e4", name: "Shell Energy", type: "company", aliases: null },
      { id: "e5", name: "Shell", type: "company", aliases: null },
    ]);

    const hits = search("Shell");
    expect(hits).toHaveLength(2);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
    expect(hits[0]!.data).toMatchObject({ name: "Shell" });
    expect(hits[1]!.data).toMatchObject({ name: "Shell Energy" });
  });

  it("respects limit option", () => {
    mockAll.mockReturnValueOnce([
      { id: "e6", name: "Amazon AU", type: "company", aliases: null },
      { id: "e7", name: "Amazon US", type: "company", aliases: null },
      { id: "e8", name: "Amazon UK", type: "company", aliases: null },
    ]);

    const hits = search("Amazon", { limit: 2 });
    expect(hits).toHaveLength(2);
  });

  it("uses correct URI format", () => {
    mockAll.mockReturnValueOnce([
      { id: "abc-123", name: "Netflix", type: "company", aliases: null },
    ]);

    const hits = search("Netflix");
    expect(hits[0]!.uri).toBe("pops:finance/entity/abc-123");
  });
});
