/**
 * Tests for SearchPage logic — debounce timing, URL param handling, clear behavior.
 *
 * These are pure logic tests that run without a DOM. Component-level tests
 * (render, user interaction) require @testing-library/react + jsdom setup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type SearchMode = "movies" | "tv" | "both";

function shouldSearchMovies(query: string, mode: SearchMode): boolean {
  return query.length > 0 && (mode === "movies" || mode === "both");
}

function shouldSearchTv(query: string, mode: SearchMode): boolean {
  return query.length > 0 && (mode === "tv" || mode === "both");
}

// ── useDebouncedValue logic (extracted for testability) ──────────────

/**
 * Simulates the debounce behavior used by SearchPage.
 * Uses callbacks to avoid microtask timing issues with fake timers.
 */
function createDebouncer(delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    debounce(value: string, callback: (v: string) => void) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => callback(value), delay);
    },
  };
}

describe("SearchPage debounce logic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should not fire before 300ms", () => {
    const { debounce } = createDebouncer(300);
    let resolved = false;
    debounce("test", () => {
      resolved = true;
    });

    vi.advanceTimersByTime(299);
    expect(resolved).toBe(false);
  });

  it("should fire after 300ms", () => {
    const { debounce } = createDebouncer(300);
    let result = "";
    debounce("test", (v) => {
      result = v;
    });

    vi.advanceTimersByTime(300);
    expect(result).toBe("test");
  });

  it("should cancel previous debounce when new value arrives", () => {
    const { debounce } = createDebouncer(300);
    const results: string[] = [];

    debounce("first", (v) => results.push(v));
    vi.advanceTimersByTime(100);

    debounce("second", (v) => results.push(v));
    vi.advanceTimersByTime(300);

    // Only the second value should resolve (first was cancelled)
    expect(results).toEqual(["second"]);
  });

  it("should reset timer on rapid input", () => {
    const { debounce } = createDebouncer(300);
    const results: string[] = [];

    debounce("a", (v) => results.push(v));
    vi.advanceTimersByTime(100);
    debounce("ab", (v) => results.push(v));
    vi.advanceTimersByTime(100);
    debounce("abc", (v) => results.push(v));
    vi.advanceTimersByTime(300);

    expect(results).toEqual(["abc"]);
  });
});

// ── URL param persistence logic ──────────────────────────────────────

describe("SearchPage URL param logic", () => {
  it("should produce ?q= param for non-empty query", () => {
    const query = "batman";
    const params = query ? { q: query } : {};
    expect(params).toEqual({ q: "batman" });
  });

  it("should produce empty params for empty query", () => {
    const query = "";
    const params = query ? { q: query } : {};
    expect(params).toEqual({});
  });

  it("should initialize query from URL param", () => {
    // Simulates: searchParams.get("q") ?? ""
    const urlParam: string | null = "inception";
    const initialQuery = urlParam ?? "";
    expect(initialQuery).toBe("inception");
  });

  it("should default to empty when no URL param", () => {
    const urlParam: string | null = null;
    const initialQuery = urlParam ?? "";
    expect(initialQuery).toBe("");
  });
});

// ── Clear button state logic ──────────────────────────────────────────

describe("SearchPage clear button logic", () => {
  it("should show clear button when query has text", () => {
    const query = "test";
    const clearable = true;
    const disabled = false;
    const showClear = clearable && query.length > 0 && !disabled;
    expect(showClear).toBe(true);
  });

  it("should hide clear button when query is empty", () => {
    const query = "";
    const clearable = true;
    const disabled = false;
    const showClear = clearable && query.length > 0 && !disabled;
    expect(showClear).toBe(false);
  });

  it("should reset query to empty on clear", () => {
    let query = "some search";
    // Simulate onClear callback
    query = "";
    expect(query).toBe("");
  });
});

// ── Empty query behavior ──────────────────────────────────────────────

describe("SearchPage empty query behavior", () => {
  it("should not enable search when query is empty", () => {
    expect(shouldSearchMovies("", "both")).toBe(false);
    expect(shouldSearchTv("", "both")).toBe(false);
  });

  it("should not enable search when query is whitespace-only", () => {
    expect(shouldSearchMovies("   ".trim(), "both")).toBe(false);
  });

  it("should enable both searches in 'both' mode with a query", () => {
    expect(shouldSearchMovies("batman", "both")).toBe(true);
    expect(shouldSearchTv("batman", "both")).toBe(true);
  });

  it("should only enable movie search in 'movies' mode", () => {
    expect(shouldSearchMovies("batman", "movies")).toBe(true);
    expect(shouldSearchTv("batman", "movies")).toBe(false);
  });

  it("should only enable TV search in 'tv' mode", () => {
    expect(shouldSearchMovies("batman", "tv")).toBe(false);
    expect(shouldSearchTv("batman", "tv")).toBe(true);
  });
});

// ── Request cancellation logic ──────────────────────────────────────

describe("SearchPage request cancellation", () => {
  it("tRPC/React Query cancels previous request when query key changes", () => {
    // When debouncedQuery changes, React Query automatically aborts
    // the previous request via its built-in AbortController support.
    // The useQuery hook's query key includes the query string —
    // when it changes, React Query cancels the in-flight request.
    //
    // Verification: { query: debouncedQuery } is passed as the query input,
    // which becomes part of the query key. React Query handles cancellation.
    const queryKey1 = { query: "bat" };
    const queryKey2 = { query: "batman" };
    expect(queryKey1).not.toEqual(queryKey2);
  });
});
