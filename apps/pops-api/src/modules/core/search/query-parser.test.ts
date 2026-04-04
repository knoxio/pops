import { describe, it, expect } from "vitest";
import { parseQuery } from "./query-parser.js";

describe("parseQuery", () => {
  it("returns plain text when no filters present", () => {
    const result = parseQuery("fight club");
    expect(result.text).toBe("fight club");
    expect(result.filters).toBeUndefined();
  });

  it("extracts type: filter", () => {
    const result = parseQuery("type:movie fight");
    expect(result.text).toBe("fight");
    expect(result.filters).toEqual([{ key: "type", value: "movie" }]);
  });

  it("extracts domain: filter", () => {
    const result = parseQuery("domain:media severance");
    expect(result.text).toBe("severance");
    expect(result.filters).toEqual([{ key: "domain", value: "media" }]);
  });

  it("extracts year:> filter", () => {
    const result = parseQuery("year:>2000 action");
    expect(result.text).toBe("action");
    expect(result.filters).toEqual([{ key: "year", value: ">2000" }]);
  });

  it("extracts year:< filter", () => {
    const result = parseQuery("year:<1990 classic");
    expect(result.text).toBe("classic");
    expect(result.filters).toEqual([{ key: "year", value: "<1990" }]);
  });

  it("extracts year: without operator", () => {
    const result = parseQuery("year:2024 new");
    expect(result.text).toBe("new");
    expect(result.filters).toEqual([{ key: "year", value: "2024" }]);
  });

  it("extracts value:> filter", () => {
    const result = parseQuery("value:>100 electronics");
    expect(result.text).toBe("electronics");
    expect(result.filters).toEqual([{ key: "value", value: ">100" }]);
  });

  it("extracts value:< filter", () => {
    const result = parseQuery("value:<50 budget");
    expect(result.text).toBe("budget");
    expect(result.filters).toEqual([{ key: "value", value: "<50" }]);
  });

  it("extracts warranty:expiring filter", () => {
    const result = parseQuery("warranty:expiring laptop");
    expect(result.text).toBe("laptop");
    expect(result.filters).toEqual([{ key: "warranty", value: "expiring" }]);
  });

  it("extracts multiple filters", () => {
    const result = parseQuery("type:movie year:>2000 fight");
    expect(result.text).toBe("fight");
    expect(result.filters).toEqual([
      { key: "type", value: "movie" },
      { key: "year", value: ">2000" },
    ]);
  });

  it("treats unknown key:value as plain text", () => {
    const result = parseQuery("foo:bar test");
    expect(result.text).toBe("foo:bar test");
    expect(result.filters).toBeUndefined();
  });

  it("mixes known and unknown filters correctly", () => {
    const result = parseQuery("type:movie foo:bar dark knight");
    expect(result.text).toBe("foo:bar dark knight");
    expect(result.filters).toEqual([{ key: "type", value: "movie" }]);
  });

  it("handles filter at end of query", () => {
    const result = parseQuery("dark knight type:movie");
    expect(result.text).toBe("dark knight");
    expect(result.filters).toEqual([{ key: "type", value: "movie" }]);
  });

  it("handles only filters, no text", () => {
    const result = parseQuery("type:movie domain:media");
    expect(result.text).toBe("");
    expect(result.filters).toEqual([
      { key: "type", value: "movie" },
      { key: "domain", value: "media" },
    ]);
  });

  it("handles empty input", () => {
    const result = parseQuery("");
    expect(result.text).toBe("");
    expect(result.filters).toBeUndefined();
  });

  it("handles whitespace-only input", () => {
    const result = parseQuery("   ");
    expect(result.text).toBe("");
    expect(result.filters).toBeUndefined();
  });

  it("preserves extra spaces in text portion as single spaces", () => {
    const result = parseQuery("  dark   knight  type:movie  ");
    expect(result.text).toBe("dark knight");
    expect(result.filters).toEqual([{ key: "type", value: "movie" }]);
  });
});
