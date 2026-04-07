import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "better-sqlite3";
import { setupTestContext, seedBudget } from "../../../shared/test-utils.js";
import { resetRegistry, registerSearchAdapter } from "../../core/search/index.js";
import { budgetsSearchAdapter, type BudgetHitData } from "./search-adapter.js";
import type { SearchHit } from "../../core/search/index.js";
import { getAdapters } from "../../core/search/index.js";

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
  resetRegistry();
  registerSearchAdapter(budgetsSearchAdapter);
});

afterEach(() => {
  resetRegistry();
  ctx.teardown();
});

function search(query: string, limit?: number): SearchHit<BudgetHitData>[] {
  const adapter = getAdapters().find((a) => a.domain === "budgets")!;
  return adapter.search(
    { text: query },
    { app: "finance", page: "budgets" },
    limit ? { limit } : undefined
  ) as SearchHit<BudgetHitData>[];
}

describe("budgets search adapter", () => {
  it("registers with correct metadata", () => {
    const adapter = getAdapters().find((a) => a.domain === "budgets");
    expect(adapter).toBeDefined();
    expect(adapter!.icon).toBe("PiggyBank");
    expect(adapter!.color).toBe("green");
  });

  it("returns empty results for empty query", () => {
    seedBudget(db, { category: "Groceries" });
    expect(search("")).toEqual([]);
    expect(search("  ")).toEqual([]);
  });

  it("returns exact match with score 1.0", () => {
    seedBudget(db, { category: "Groceries", period: "2025-06", amount: 500 });

    const hits = search("Groceries");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.score).toBe(1.0);
    expect(hits[0]!.matchType).toBe("exact");
    expect(hits[0]!.matchField).toBe("category");
    expect(hits[0]!.data).toEqual({
      category: "Groceries",
      period: "2025-06",
      amount: 500,
    });
  });

  it("exact match is case-insensitive", () => {
    seedBudget(db, { category: "Groceries" });

    const hits = search("groceries");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.score).toBe(1.0);
    expect(hits[0]!.matchType).toBe("exact");
  });

  it("returns prefix match with score 0.8", () => {
    seedBudget(db, { category: "Entertainment", period: "2025-06", amount: 200 });

    const hits = search("Enter");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.score).toBe(0.8);
    expect(hits[0]!.matchType).toBe("prefix");
    expect(hits[0]!.data.category).toBe("Entertainment");
  });

  it("returns contains match with score 0.5", () => {
    seedBudget(db, { category: "Entertainment" });

    const hits = search("tain");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.score).toBe(0.5);
    expect(hits[0]!.matchType).toBe("contains");
  });

  it("sorts results by score descending", () => {
    seedBudget(db, { category: "Transport" });
    seedBudget(db, { category: "Transportation Costs" });
    seedBudget(db, { category: "Public Transport" });

    const hits = search("Transport");
    expect(hits.length).toBeGreaterThanOrEqual(2);

    // "Transport" = exact (1.0), "Transportation Costs" = prefix (0.8), "Public Transport" = contains (0.5)
    expect(hits[0]!.score).toBe(1.0);
    expect(hits[0]!.data.category).toBe("Transport");
    expect(hits[1]!.score).toBe(0.8);
    expect(hits[1]!.data.category).toBe("Transportation Costs");
    expect(hits[2]!.score).toBe(0.5);
    expect(hits[2]!.data.category).toBe("Public Transport");
  });

  it("includes hit data with category, period, and amount", () => {
    const id = seedBudget(db, {
      category: "Dining",
      period: "2025-07",
      amount: 300,
    });

    const hits = search("Dining");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.uri).toBe(`/budgets/${id}`);
    expect(hits[0]!.data).toEqual({
      category: "Dining",
      period: "2025-07",
      amount: 300,
    });
  });

  it("handles null period and amount", () => {
    seedBudget(db, { category: "Miscellaneous", period: null, amount: null });

    const hits = search("Miscellaneous");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.data.period).toBeNull();
    expect(hits[0]!.data.amount).toBeNull();
  });

  it("returns no results when nothing matches", () => {
    seedBudget(db, { category: "Groceries" });
    expect(search("zzz-no-match")).toEqual([]);
  });

  it("respects limit option", () => {
    for (let i = 0; i < 5; i++) {
      seedBudget(db, { category: `Cat ${i}` });
    }

    const hits = search("Cat", 3);
    expect(hits).toHaveLength(3);
  });
});
