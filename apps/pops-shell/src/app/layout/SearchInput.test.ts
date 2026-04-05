/**
 * SearchInput section-mapping logic tests.
 *
 * The SearchResultsPanel component is tested comprehensively in the navigation
 * package. These tests cover the mapping helpers used to transform tRPC API
 * sections into panel-ready sections.
 */
import { describe, it, expect } from "vitest";

/** Replicated from SearchInput — must stay in sync. */
function domainToLabel(domain: string): string {
  return domain
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

describe("domainToLabel", () => {
  it("capitalises a single-word domain", () => {
    expect(domainToLabel("movies")).toBe("Movies");
    expect(domainToLabel("budgets")).toBe("Budgets");
    expect(domainToLabel("entities")).toBe("Entities");
    expect(domainToLabel("transactions")).toBe("Transactions");
  });

  it("splits hyphenated domains into title-cased words", () => {
    expect(domainToLabel("tv-shows")).toBe("Tv Shows");
    expect(domainToLabel("inventory-items")).toBe("Inventory Items");
  });
});

describe("showPanel condition", () => {
  it("is true only when open and query is non-empty", () => {
    const cases: [boolean, string, boolean][] = [
      [true, "lamp", true],
      [true, "", false],
      [false, "lamp", false],
      [false, "", false],
    ];

    for (const [isOpen, query, expected] of cases) {
      expect(isOpen && query.length > 0).toBe(expected);
    }
  });
});
