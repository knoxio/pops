import { describe, it, expect, beforeEach } from "vitest";
import {
  registerSearchAdapter,
  getAdapters,
  resetRegistry,
} from "./registry.js";
import type { SearchAdapter, SearchHit, Query, SearchContext } from "./types.js";

function makeAdapter(domain: string): SearchAdapter {
  return {
    domain,
    icon: "Search",
    color: "gray",
    search(
      _query: Query,
      _context: SearchContext,
      _options?: { limit?: number },
    ): SearchHit[] {
      return [];
    },
  };
}

beforeEach(() => {
  resetRegistry();
});

describe("registerSearchAdapter", () => {
  it("adds an adapter to the registry", () => {
    registerSearchAdapter(makeAdapter("movies"));
    expect(getAdapters()).toHaveLength(1);
    expect(getAdapters()[0].domain).toBe("movies");
  });

  it("adds multiple adapters with distinct domains", () => {
    registerSearchAdapter(makeAdapter("movies"));
    registerSearchAdapter(makeAdapter("transactions"));
    registerSearchAdapter(makeAdapter("entities"));
    expect(getAdapters()).toHaveLength(3);
  });

  it("throws when registering a duplicate domain", () => {
    registerSearchAdapter(makeAdapter("movies"));
    expect(() => registerSearchAdapter(makeAdapter("movies"))).toThrow(
      'Search adapter for domain "movies" is already registered',
    );
  });

  it("does not add the duplicate adapter when registration fails", () => {
    registerSearchAdapter(makeAdapter("movies"));
    expect(() => registerSearchAdapter(makeAdapter("movies"))).toThrow();
    expect(getAdapters()).toHaveLength(1);
  });
});

describe("getAdapters", () => {
  it("returns an empty array when no adapters are registered", () => {
    expect(getAdapters()).toEqual([]);
  });

  it("returns all registered adapters", () => {
    const movies = makeAdapter("movies");
    const transactions = makeAdapter("transactions");
    registerSearchAdapter(movies);
    registerSearchAdapter(transactions);

    const result = getAdapters();
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.domain)).toEqual(["movies", "transactions"]);
  });

  it("returns a copy — mutating the result does not affect the registry", () => {
    registerSearchAdapter(makeAdapter("movies"));
    const first = getAdapters();
    first.push(makeAdapter("transactions"));
    expect(getAdapters()).toHaveLength(1);
  });
});
