import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Database } from "better-sqlite3";
import { eq } from "drizzle-orm";
import { transactions as transactionsTable } from "@pops/db-types";
import { getDrizzle } from "../../../db.js";
import {
  setupTestContext,
  seedTransaction,
  seedEntity,
  createCaller,
} from "../../../shared/test-utils.js";

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe("transactions.list", () => {
  it("returns empty list when no transactions exist", async () => {
    const result = await caller.finance.transactions.list({});
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.hasMore).toBe(false);
  });

  it("returns all transactions with correct shape", async () => {
    seedTransaction(db, { description: "Groceries", account: "Up Savings", date: "2025-06-15" });
    seedTransaction(db, { description: "Fuel", account: "ANZ Visa", date: "2025-06-14" });

    const result = await caller.finance.transactions.list({});
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);

    // Sorted by date DESC (newest first)
    expect(result.data[0]!.description).toBe("Groceries");
    expect(result.data[1]!.description).toBe("Fuel");
  });

  it("returns camelCase fields", async () => {
    seedEntity(db, { name: "Woolworths", id: "ent-123" });
    seedTransaction(db, {
      description: "Test",
      account: "Up",
      amount: 50.0,
      date: "2025-06-15",
      entity_id: "ent-123",
      entity_name: "Woolworths",
      related_transaction_id: "txn-456",
      last_edited_time: "2025-06-15T10:00:00.000Z",
    });

    const result = await caller.finance.transactions.list({});
    const txn = result.data[0];
    expect(txn).toHaveProperty("id");
    expect(txn).toHaveProperty("entityId", "ent-123");
    expect(txn).toHaveProperty("entityName", "Woolworths");
    expect(txn).toHaveProperty("relatedTransactionId", "txn-456");
    expect(txn).toHaveProperty("lastEditedTime", "2025-06-15T10:00:00.000Z");
    // No snake_case leaking
    expect(txn).not.toHaveProperty("notion_id");
    expect(txn).not.toHaveProperty("entity_id");
    expect(txn).not.toHaveProperty("last_edited_time");
    // Removed boolean fields
    expect(txn).not.toHaveProperty("novatedLease");
    expect(txn).not.toHaveProperty("taxReturn");
  });

  it("parses JSON tags into array", async () => {
    seedTransaction(db, {
      description: "Test",
      account: "Up",
      tags: JSON.stringify(["Groceries", "Online"]),
    });

    const result = await caller.finance.transactions.list({});
    expect(result.data[0]!.tags).toEqual(["Groceries", "Online"]);
  });

  it("returns empty tags array when tags is empty JSON array", async () => {
    seedTransaction(db, { description: "Test", account: "Up", tags: "[]" });

    const result = await caller.finance.transactions.list({});
    expect(result.data[0]!.tags).toEqual([]);
  });

  it("filters by search (case-insensitive LIKE)", async () => {
    seedTransaction(db, { description: "Woolworths Groceries", account: "Up" });
    seedTransaction(db, { description: "Coles Groceries", account: "Up" });
    seedTransaction(db, { description: "Fuel Station", account: "Up" });

    const result = await caller.finance.transactions.list({ search: "wool" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.description).toBe("Woolworths Groceries");
    expect(result.pagination.total).toBe(1);
  });

  it("filters by account", async () => {
    seedTransaction(db, { description: "Test 1", account: "Up Savings" });
    seedTransaction(db, { description: "Test 2", account: "ANZ Visa" });

    const result = await caller.finance.transactions.list({ account: "ANZ Visa" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.description).toBe("Test 2");
  });

  it("filters by startDate", async () => {
    seedTransaction(db, { description: "Old", account: "Up", date: "2025-01-01" });
    seedTransaction(db, { description: "Recent", account: "Up", date: "2025-06-01" });

    const result = await caller.finance.transactions.list({ startDate: "2025-05-01" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.description).toBe("Recent");
  });

  it("filters by endDate", async () => {
    seedTransaction(db, { description: "Old", account: "Up", date: "2025-01-01" });
    seedTransaction(db, { description: "Recent", account: "Up", date: "2025-06-01" });

    const result = await caller.finance.transactions.list({ endDate: "2025-02-01" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.description).toBe("Old");
  });

  it("filters by date range", async () => {
    seedTransaction(db, { description: "Before", account: "Up", date: "2025-01-01" });
    seedTransaction(db, { description: "Within", account: "Up", date: "2025-03-15" });
    seedTransaction(db, { description: "After", account: "Up", date: "2025-06-01" });

    const result = await caller.finance.transactions.list({
      startDate: "2025-03-01",
      endDate: "2025-04-01",
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.description).toBe("Within");
  });

  it("filters by tag (exact JSON array membership)", async () => {
    seedTransaction(db, {
      description: "Test 1",
      account: "Up",
      tags: JSON.stringify(["Groceries", "Online"]),
    });
    seedTransaction(db, {
      description: "Test 2",
      account: "Up",
      tags: JSON.stringify(["Transport"]),
    });

    const result = await caller.finance.transactions.list({ tag: "Groceries" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.description).toBe("Test 1");
  });

  it("filters by entityId", async () => {
    seedEntity(db, { name: "Entity 1", id: "ent-123" });
    seedEntity(db, { name: "Entity 2", id: "ent-456" });
    seedTransaction(db, { description: "Test 1", account: "Up", entity_id: "ent-123" });
    seedTransaction(db, { description: "Test 2", account: "Up", entity_id: "ent-456" });

    const result = await caller.finance.transactions.list({ entityId: "ent-123" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.description).toBe("Test 1");
  });

  it("filters by type", async () => {
    seedTransaction(db, { description: "Test 1", account: "Up", type: "Purchase" });
    seedTransaction(db, { description: "Test 2", account: "Up", type: "Transfer" });

    const result = await caller.finance.transactions.list({ type: "Purchase" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.description).toBe("Test 1");
  });

  it("combines multiple filters", async () => {
    seedTransaction(db, {
      description: "Match",
      account: "Up",
      date: "2025-06-01",
      type: "Purchase",
      tags: JSON.stringify(["Groceries"]),
    });
    seedTransaction(db, {
      description: "Wrong account",
      account: "ANZ",
      date: "2025-06-01",
      type: "Purchase",
      tags: JSON.stringify(["Groceries"]),
    });
    seedTransaction(db, {
      description: "Wrong date",
      account: "Up",
      date: "2025-01-01",
      type: "Purchase",
      tags: JSON.stringify(["Groceries"]),
    });

    const result = await caller.finance.transactions.list({
      account: "Up",
      startDate: "2025-05-01",
      type: "Purchase",
      tag: "Groceries",
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.description).toBe("Match");
  });

  it("paginates with limit and offset", async () => {
    for (let i = 0; i < 10; i++) {
      seedTransaction(db, {
        description: `Transaction ${String(i).padStart(2, "0")}`,
        account: "Up",
        date: `2025-06-${String(i + 1).padStart(2, "0")}`,
      });
    }

    const page1 = await caller.finance.transactions.list({ limit: 3, offset: 0 });
    expect(page1.data).toHaveLength(3);
    expect(page1.pagination).toEqual({
      total: 10,
      limit: 3,
      offset: 0,
      hasMore: true,
    });

    const page2 = await caller.finance.transactions.list({ limit: 3, offset: 3 });
    expect(page2.data).toHaveLength(3);
    expect(page2.pagination.offset).toBe(3);

    // Descriptions should not overlap
    const page1Descs = page1.data.map((t) => t.description);
    const page2Descs = page2.data.map((t) => t.description);
    expect(page1Descs).not.toEqual(page2Descs);
  });

  it("accepts large limit values", async () => {
    const result = await caller.finance.transactions.list({ limit: 9999 });
    expect(result.pagination.limit).toBe(9999);
  });

  it("defaults limit to 50 and offset to 0", async () => {
    const result = await caller.finance.transactions.list({});
    expect(result.pagination.limit).toBe(50);
    expect(result.pagination.offset).toBe(0);
  });

  it("throws UNAUTHORIZED without auth", async () => {
    const unauthCaller = createCaller(false);
    await expect(unauthCaller.finance.transactions.list({})).rejects.toThrow(TRPCError);
    await expect(unauthCaller.finance.transactions.list({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("transactions.get", () => {
  it("returns a single transaction by ID", async () => {
    const id = seedTransaction(db, { description: "Groceries", account: "Up" });

    const result = await caller.finance.transactions.get({ id });
    expect(result.data.id).toBe(id);
    expect(result.data.description).toBe("Groceries");
  });

  it("throws NOT_FOUND for non-existent ID", async () => {
    await expect(caller.finance.transactions.get({ id: "does-not-exist" })).rejects.toThrow(
      TRPCError
    );
    await expect(caller.finance.transactions.get({ id: "does-not-exist" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("transactions.create", () => {
  it("creates a transaction with required fields only", async () => {
    const result = await caller.finance.transactions.create({
      description: "Test Transaction",
      account: "Up Savings",
      amount: 50.0,
      date: "2025-06-15",
      type: "Purchase",
    });

    expect(result.message).toBe("Transaction created");
    expect(result.data.description).toBe("Test Transaction");
    expect(result.data.account).toBe("Up Savings");
    expect(result.data.amount).toBe(50.0);
    expect(result.data.date).toBe("2025-06-15");
    expect(result.data.type).toBe("Purchase");
    expect(result.data.id).toBeDefined();
    expect(result.data.tags).toEqual([]);
  });

  it("creates a transaction with all fields", async () => {
    seedEntity(db, { name: "Woolworths", id: "ent-123" });
    const result = await caller.finance.transactions.create({
      description: "Woolworths Groceries",
      account: "Up Savings",
      amount: 150.75,
      date: "2025-06-15",
      type: "Purchase",
      tags: ["Groceries", "Online"],
      entityId: "ent-123",
      entityName: "Woolworths",
      location: "Sydney CBD",
      country: "Australia",
      relatedTransactionId: "txn-456",
      notes: "Weekly groceries",
    });

    expect(result.data.description).toBe("Woolworths Groceries");
    expect(result.data.tags).toEqual(["Groceries", "Online"]);
    expect(result.data.entityId).toBe("ent-123");
    expect(result.data.entityName).toBe("Woolworths");
    expect(result.data.location).toBe("Sydney CBD");
    expect(result.data.country).toBe("Australia");
    expect(result.data.relatedTransactionId).toBe("txn-456");
    expect(result.data.notes).toBe("Weekly groceries");
  });

  it("rejects missing required fields", async () => {
    await expect(
      // @ts-expect-error - Testing validation with missing required fields
      caller.finance.transactions.create({
        description: "Test",
        // Missing account, amount, date, type
      })
    ).rejects.toThrow(TRPCError);
    await expect(
      // @ts-expect-error - Testing validation with missing required fields
      caller.finance.transactions.create({
        description: "Test",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects empty description", async () => {
    await expect(
      caller.finance.transactions.create({
        description: "",
        account: "Up",
        amount: 50.0,
        date: "2025-06-15",
        type: "Purchase",
      })
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.finance.transactions.create({
        description: "",
        account: "Up",
        amount: 50.0,
        date: "2025-06-15",
        type: "Purchase",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("persists to the database", async () => {
    await caller.finance.transactions.create({
      description: "Test Transaction",
      account: "Up",
      amount: 50.0,
      date: "2025-06-15",
      type: "Purchase",
    });

    const row = db
      .prepare("SELECT * FROM transactions WHERE description = ?")
      .get("Test Transaction");
    expect(row).toBeDefined();
  });
});

describe("transactions.update", () => {
  it("updates a single field", async () => {
    const id = seedTransaction(db, {
      description: "Original",
      account: "Up",
      amount: 50.0,
      date: "2025-06-15",
    });

    const result = await caller.finance.transactions.update({
      id,
      data: { description: "Updated" },
    });

    expect(result.message).toBe("Transaction updated");
    expect(result.data.description).toBe("Updated");
    expect(result.data.account).toBe("Up");
  });

  it("updates tags", async () => {
    const id = seedTransaction(db, {
      description: "Test",
      account: "Up",
      amount: 50.0,
      date: "2025-06-15",
    });

    const result = await caller.finance.transactions.update({
      id,
      data: { tags: ["Shopping", "Online"] },
    });

    expect(result.data.tags).toEqual(["Shopping", "Online"]);
  });

  it("clears a field by setting to null", async () => {
    const id = seedTransaction(db, { description: "Test", account: "Up", notes: "Some notes" });

    const result = await caller.finance.transactions.update({ id, data: { notes: null } });

    expect(result.data.notes).toBeNull();
  });

  it("updates last_edited_time", async () => {
    const id = seedTransaction(db, {
      description: "Test",
      account: "Up",
      last_edited_time: "2020-01-01T00:00:00.000Z",
    });

    await caller.finance.transactions.update({ id, data: { amount: 100.0 } });

    const row = getDrizzle()
      .select({ lastEditedTime: transactionsTable.lastEditedTime })
      .from(transactionsTable)
      .where(eq(transactionsTable.id, id))
      .get();
    expect(row!.lastEditedTime).not.toBe("2020-01-01T00:00:00.000Z");
  });

  it("throws NOT_FOUND for non-existent ID", async () => {
    await expect(
      caller.finance.transactions.update({
        id: "does-not-exist",
        data: { description: "Updated" },
      })
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.finance.transactions.update({
        id: "does-not-exist",
        data: { description: "Updated" },
      })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects empty description", async () => {
    const id = seedTransaction(db, { description: "Test", account: "Up" });

    await expect(
      caller.finance.transactions.update({ id, data: { description: "" } })
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.finance.transactions.update({ id, data: { description: "" } })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("transactions.delete", () => {
  it("deletes an existing transaction", async () => {
    const id = seedTransaction(db, { description: "To Delete", account: "Up" });

    const result = await caller.finance.transactions.delete({ id });
    expect(result.message).toBe("Transaction deleted");

    // Verify gone from DB
    const row = getDrizzle()
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, id))
      .get();
    expect(row).toBeUndefined();
  });

  it("throws NOT_FOUND for non-existent ID", async () => {
    await expect(caller.finance.transactions.delete({ id: "does-not-exist" })).rejects.toThrow(
      TRPCError
    );
    await expect(
      caller.finance.transactions.delete({ id: "does-not-exist" })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("is idempotent — second delete throws NOT_FOUND", async () => {
    const id = seedTransaction(db, { description: "To Delete", account: "Up" });

    await caller.finance.transactions.delete({ id });
    await expect(caller.finance.transactions.delete({ id })).rejects.toThrow(TRPCError);
    await expect(caller.finance.transactions.delete({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
