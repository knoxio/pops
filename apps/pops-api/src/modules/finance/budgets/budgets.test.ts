import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Database } from "better-sqlite3";
import { eq } from "drizzle-orm";
import { budgets as budgetsTable } from "@pops/db-types";
import { getDrizzle } from "../../../db.js";
import { setupTestContext, seedBudget, createCaller } from "../../../shared/test-utils.js";

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe("budgets.list", () => {
  it("returns empty list when no budgets exist", async () => {
    const result = await caller.finance.budgets.list({});
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.hasMore).toBe(false);
  });

  it("returns all budgets with correct shape", async () => {
    seedBudget(db, { category: "Groceries" });
    seedBudget(db, { category: "Entertainment" });

    const result = await caller.finance.budgets.list({});
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);

    // Sorted by category
    expect(result.data[0]!.category).toBe("Entertainment");
    expect(result.data[1]!.category).toBe("Groceries");
  });

  it("returns camelCase fields", async () => {
    seedBudget(db, {
      category: "Groceries",
      period: "2025-06",
      amount: 500,
      active: 1,
      notes: "Monthly grocery budget",
      last_edited_time: "2025-06-15T10:00:00.000Z",
    });

    const result = await caller.finance.budgets.list({});
    const budget = result.data[0];
    expect(budget).toHaveProperty("id");
    expect(budget).toHaveProperty("category", "Groceries");
    expect(budget).toHaveProperty("period", "2025-06");
    expect(budget).toHaveProperty("amount", 500);
    expect(budget).toHaveProperty("active", true);
    expect(budget).toHaveProperty("notes", "Monthly grocery budget");
    expect(budget).toHaveProperty("lastEditedTime", "2025-06-15T10:00:00.000Z");
    // No snake_case leaking
    expect(budget).not.toHaveProperty("notion_id");
    expect(budget).not.toHaveProperty("last_edited_time");
  });

  it("converts active from INTEGER to boolean (active=1)", async () => {
    seedBudget(db, { category: "Groceries", active: 1 });

    const result = await caller.finance.budgets.list({});
    expect(result.data[0]!.active).toBe(true);
    expect(typeof result.data[0]!.active).toBe("boolean");
  });

  it("converts active from INTEGER to boolean (active=0)", async () => {
    seedBudget(db, { category: "Groceries", active: 0 });

    const result = await caller.finance.budgets.list({});
    expect(result.data[0]!.active).toBe(false);
    expect(typeof result.data[0]!.active).toBe("boolean");
  });

  it("filters by search (case-insensitive LIKE on category)", async () => {
    seedBudget(db, { category: "Groceries" });
    seedBudget(db, { category: "Entertainment" });
    seedBudget(db, { category: "Dining Out" });

    const result = await caller.finance.budgets.list({ search: "grocer" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.category).toBe("Groceries");
    expect(result.pagination.total).toBe(1);
  });

  it("filters by period (exact match)", async () => {
    seedBudget(db, { category: "Groceries", period: "2025-06" });
    seedBudget(db, { category: "Entertainment", period: "2025-07" });
    seedBudget(db, { category: "Dining", period: "2025-06" });

    const result = await caller.finance.budgets.list({ period: "2025-06" });
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
  });

  it("filters by active=true", async () => {
    seedBudget(db, { category: "Groceries", active: 1 });
    seedBudget(db, { category: "Entertainment", active: 0 });
    seedBudget(db, { category: "Dining", active: 1 });

    const result = await caller.finance.budgets.list({ active: "true" });
    expect(result.data).toHaveLength(2);
    expect(result.data.every((b) => b.active === true)).toBe(true);
  });

  it("filters by active=false", async () => {
    seedBudget(db, { category: "Groceries", active: 1 });
    seedBudget(db, { category: "Entertainment", active: 0 });
    seedBudget(db, { category: "Dining", active: 0 });

    const result = await caller.finance.budgets.list({ active: "false" });
    expect(result.data).toHaveLength(2);
    expect(result.data.every((b) => b.active === false)).toBe(true);
  });

  it("combines all filters (search, period, active)", async () => {
    seedBudget(db, { category: "Groceries Weekly", period: "2025-06", active: 1 });
    seedBudget(db, { category: "Groceries Monthly", period: "2025-06", active: 0 });
    seedBudget(db, { category: "Entertainment", period: "2025-06", active: 1 });

    const result = await caller.finance.budgets.list({
      search: "grocer",
      period: "2025-06",
      active: "true",
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.category).toBe("Groceries Weekly");
  });

  it("paginates with limit and offset", async () => {
    for (let i = 0; i < 10; i++) {
      seedBudget(db, { category: `Category ${String(i).padStart(2, "0")}` });
    }

    const page1 = await caller.finance.budgets.list({ limit: 3, offset: 0 });
    expect(page1.data).toHaveLength(3);
    expect(page1.pagination).toEqual({
      total: 10,
      limit: 3,
      offset: 0,
      hasMore: true,
    });

    const page2 = await caller.finance.budgets.list({ limit: 3, offset: 3 });
    expect(page2.data).toHaveLength(3);
    expect(page2.pagination.offset).toBe(3);

    // Categories should not overlap
    const page1Categories = page1.data.map((b) => b.category);
    const page2Categories = page2.data.map((b) => b.category);
    expect(page1Categories).not.toEqual(page2Categories);
  });

  it("defaults limit to 50 and offset to 0", async () => {
    const result = await caller.finance.budgets.list({});
    expect(result.pagination.limit).toBe(50);
    expect(result.pagination.offset).toBe(0);
  });

  it("throws UNAUTHORIZED without auth", async () => {
    const unauthCaller = createCaller(false);
    await expect(unauthCaller.finance.budgets.list({})).rejects.toThrow(TRPCError);
    await expect(unauthCaller.finance.budgets.list({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("budgets.get", () => {
  it("returns a single budget by ID", async () => {
    const id = seedBudget(db, { category: "Groceries", amount: 500 });

    const result = await caller.finance.budgets.get({ id });
    expect(result.data.id).toBe(id);
    expect(result.data.category).toBe("Groceries");
    expect(result.data.amount).toBe(500);
  });

  it("throws NOT_FOUND for non-existent ID", async () => {
    await expect(caller.finance.budgets.get({ id: "does-not-exist" })).rejects.toThrow(TRPCError);
    await expect(caller.finance.budgets.get({ id: "does-not-exist" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("budgets.create", () => {
  it("creates a budget with required fields only (just category)", async () => {
    const result = await caller.finance.budgets.create({ category: "Groceries" });

    expect(result.message).toBe("Budget created");
    expect(result.data.category).toBe("Groceries");
    expect(result.data.id).toBeDefined();
    expect(result.data.period).toBeNull();
    expect(result.data.amount).toBeNull();
    expect(result.data.active).toBe(false);
    expect(result.data.notes).toBeNull();
  });

  it("creates a budget with all fields", async () => {
    const result = await caller.finance.budgets.create({
      category: "Groceries",
      period: "2025-06",
      amount: 500,
      active: true,
      notes: "Monthly grocery budget",
    });

    expect(result.data.category).toBe("Groceries");
    expect(result.data.period).toBe("2025-06");
    expect(result.data.amount).toBe(500);
    expect(result.data.active).toBe(true);
    expect(result.data.notes).toBe("Monthly grocery budget");
  });

  it("throws CONFLICT for duplicate category+period combination", async () => {
    seedBudget(db, { category: "Groceries", period: "2025-06" });

    await expect(
      caller.finance.budgets.create({
        category: "Groceries",
        period: "2025-06",
      })
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.finance.budgets.create({
        category: "Groceries",
        period: "2025-06",
      })
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("throws CONFLICT for duplicate category with null period", async () => {
    seedBudget(db, { category: "Groceries", period: null });

    await expect(
      caller.finance.budgets.create({
        category: "Groceries",
      })
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.finance.budgets.create({
        category: "Groceries",
      })
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("allows same category with different periods", async () => {
    seedBudget(db, { category: "Groceries", period: "2025-06" });

    const result = await caller.finance.budgets.create({
      category: "Groceries",
      period: "2025-07",
    });

    expect(result.data.category).toBe("Groceries");
    expect(result.data.period).toBe("2025-07");
  });

  it("persists to the database", async () => {
    await caller.finance.budgets.create({ category: "New Budget" });

    const row = getDrizzle()
      .select()
      .from(budgetsTable)
      .where(eq(budgetsTable.category, "New Budget"))
      .get();
    expect(row).toBeDefined();
  });

  it("stores all fields in SQLite", async () => {
    const result = await caller.finance.budgets.create({
      category: "Groceries",
      period: "2025-06",
      amount: 500,
      active: true,
      notes: "Test notes",
    });

    // Verify all fields persisted in SQLite
    const row = getDrizzle()
      .select()
      .from(budgetsTable)
      .where(eq(budgetsTable.id, result.data.id))
      .get();
    expect(row).toBeDefined();
    expect(row!.category).toBe("Groceries");
    expect(row!.period).toBe("2025-06");
    expect(row!.amount).toBe(500);
    expect(row!.active).toBe(1);
    expect(row!.notes).toBe("Test notes");
  });
});

describe("budgets.update", () => {
  it("updates a single field", async () => {
    const id = seedBudget(db, { category: "Groceries" });

    const result = await caller.finance.budgets.update({ id, data: { amount: 600 } });

    expect(result.message).toBe("Budget updated");
    expect(result.data.category).toBe("Groceries");
    expect(result.data.amount).toBe(600);
  });

  it("updates multiple fields at once", async () => {
    const id = seedBudget(db, { category: "Groceries" });

    const result = await caller.finance.budgets.update({
      id,
      data: {
        category: "Food & Groceries",
        period: "2025-06",
        amount: 500,
      },
    });

    expect(result.data.category).toBe("Food & Groceries");
    expect(result.data.period).toBe("2025-06");
    expect(result.data.amount).toBe(500);
  });

  it("clears a field by setting to null", async () => {
    const id = seedBudget(db, { category: "Groceries", amount: 500 });

    const result = await caller.finance.budgets.update({ id, data: { amount: null } });

    expect(result.data.amount).toBeNull();
  });

  it("toggles active from false to true", async () => {
    const id = seedBudget(db, { category: "Groceries", active: 0 });

    const result = await caller.finance.budgets.update({ id, data: { active: true } });

    expect(result.data.active).toBe(true);
  });

  it("toggles active from true to false", async () => {
    const id = seedBudget(db, { category: "Groceries", active: 1 });

    const result = await caller.finance.budgets.update({ id, data: { active: false } });

    expect(result.data.active).toBe(false);
  });

  it("updates last_edited_time", async () => {
    const id = seedBudget(db, {
      category: "Groceries",
      last_edited_time: "2020-01-01T00:00:00.000Z",
    });

    await caller.finance.budgets.update({ id, data: { amount: 500 } });

    const row = getDrizzle()
      .select({ lastEditedTime: budgetsTable.lastEditedTime })
      .from(budgetsTable)
      .where(eq(budgetsTable.id, id))
      .get();
    expect(row!.lastEditedTime).not.toBe("2020-01-01T00:00:00.000Z");
  });

  it("throws NOT_FOUND for non-existent ID", async () => {
    await expect(
      caller.finance.budgets.update({
        id: "does-not-exist",
        data: { category: "New Category" },
      })
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.finance.budgets.update({
        id: "does-not-exist",
        data: { category: "New Category" },
      })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("persists update to SQLite", async () => {
    const id = seedBudget(db, { category: "Groceries", amount: 500 });

    await caller.finance.budgets.update({ id, data: { amount: 600 } });

    // Verify SQLite was updated
    const row = getDrizzle()
      .select({ amount: budgetsTable.amount })
      .from(budgetsTable)
      .where(eq(budgetsTable.id, id))
      .get();
    expect(row!.amount).toBe(600);
  });
});

describe("budgets.delete", () => {
  it("deletes an existing budget", async () => {
    const id = seedBudget(db, { category: "Groceries" });

    const result = await caller.finance.budgets.delete({ id });
    expect(result.message).toBe("Budget deleted");

    // Verify gone from DB
    const row = getDrizzle().select().from(budgetsTable).where(eq(budgetsTable.id, id)).get();
    expect(row).toBeUndefined();
  });

  it("throws NOT_FOUND for non-existent ID", async () => {
    await expect(caller.finance.budgets.delete({ id: "does-not-exist" })).rejects.toThrow(
      TRPCError
    );
    await expect(caller.finance.budgets.delete({ id: "does-not-exist" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("is idempotent — second delete throws NOT_FOUND", async () => {
    const id = seedBudget(db, { category: "Groceries" });

    await caller.finance.budgets.delete({ id });
    await expect(caller.finance.budgets.delete({ id })).rejects.toThrow(TRPCError);
    await expect(caller.finance.budgets.delete({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("removes row from SQLite", async () => {
    const id = seedBudget(db, { category: "Groceries" });

    await caller.finance.budgets.delete({ id });

    // Verify row is gone from SQLite
    const row = getDrizzle().select().from(budgetsTable).where(eq(budgetsTable.id, id)).get();
    expect(row).toBeUndefined();
  });
});
