import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Database } from "better-sqlite3";
import { setupTestContext, seedInventoryItem, createCaller } from "../../shared/test-utils.js";

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe("inventory.list", () => {
  it("returns empty list when no items exist", async () => {
    const result = await caller.inventory.list({});
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.hasMore).toBe(false);
  });

  it("returns all items with correct shape", async () => {
    seedInventoryItem(db, { item_name: "Laptop" });
    seedInventoryItem(db, { item_name: "Desk" });

    const result = await caller.inventory.list({});
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);

    // Sorted by item_name
    expect(result.data[0].itemName).toBe("Desk");
    expect(result.data[1].itemName).toBe("Laptop");
  });

  it("returns camelCase fields", async () => {
    seedInventoryItem(db, {
      item_name: "MacBook Pro",
      purchase_date: "2025-01-15",
      warranty_expires: "2027-01-15",
      replacement_value: 2500.0,
      resale_value: 1800.0,
      last_edited_time: "2025-06-15T10:00:00.000Z",
    });

    const result = await caller.inventory.list({});
    const item = result.data[0];
    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("itemName", "MacBook Pro");
    expect(item).toHaveProperty("purchaseDate", "2025-01-15");
    expect(item).toHaveProperty("warrantyExpires", "2027-01-15");
    expect(item).toHaveProperty("replacementValue", 2500.0);
    expect(item).toHaveProperty("resaleValue", 1800.0);
    expect(item).toHaveProperty("lastEditedTime", "2025-06-15T10:00:00.000Z");
    // No snake_case leaking
    expect(item).not.toHaveProperty("notion_id");
    expect(item).not.toHaveProperty("item_name");
    expect(item).not.toHaveProperty("last_edited_time");
  });

  it("converts in_use and deductible from INTEGER to boolean", async () => {
    seedInventoryItem(db, { item_name: "Laptop", in_use: 1, deductible: 0 });
    seedInventoryItem(db, { item_name: "Desk", in_use: 0, deductible: 1 });

    const result = await caller.inventory.list({});
    expect(result.data[0].inUse).toBe(false);
    expect(result.data[0].deductible).toBe(true);
    expect(result.data[1].inUse).toBe(true);
    expect(result.data[1].deductible).toBe(false);
  });

  it("filters by search (case-insensitive LIKE on item_name)", async () => {
    seedInventoryItem(db, { item_name: "MacBook Pro" });
    seedInventoryItem(db, { item_name: "iPhone" });
    seedInventoryItem(db, { item_name: "iPad" });

    const result = await caller.inventory.list({ search: "mac" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].itemName).toBe("MacBook Pro");
    expect(result.pagination.total).toBe(1);
  });

  it("filters by room", async () => {
    seedInventoryItem(db, { item_name: "Desk", room: "Office" });
    seedInventoryItem(db, { item_name: "Bed", room: "Bedroom" });

    const result = await caller.inventory.list({ room: "Office" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].itemName).toBe("Desk");
  });

  it("filters by type", async () => {
    seedInventoryItem(db, { item_name: "MacBook", type: "Electronics" });
    seedInventoryItem(db, { item_name: "Desk", type: "Furniture" });

    const result = await caller.inventory.list({ type: "Electronics" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].itemName).toBe("MacBook");
  });

  it("filters by condition", async () => {
    seedInventoryItem(db, { item_name: "Old Laptop", condition: "Fair" });
    seedInventoryItem(db, { item_name: "New Phone", condition: "Excellent" });

    const result = await caller.inventory.list({ condition: "Excellent" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].itemName).toBe("New Phone");
  });

  it("filters by inUse=true", async () => {
    seedInventoryItem(db, { item_name: "Active Laptop", in_use: 1 });
    seedInventoryItem(db, { item_name: "Stored Tablet", in_use: 0 });

    const result = await caller.inventory.list({ inUse: "true" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].itemName).toBe("Active Laptop");
  });

  it("filters by inUse=false", async () => {
    seedInventoryItem(db, { item_name: "Active Laptop", in_use: 1 });
    seedInventoryItem(db, { item_name: "Stored Tablet", in_use: 0 });

    const result = await caller.inventory.list({ inUse: "false" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].itemName).toBe("Stored Tablet");
  });

  it("filters by deductible=true", async () => {
    seedInventoryItem(db, { item_name: "Business Laptop", deductible: 1 });
    seedInventoryItem(db, { item_name: "Personal Phone", deductible: 0 });

    const result = await caller.inventory.list({ deductible: "true" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].itemName).toBe("Business Laptop");
  });

  it("filters by deductible=false", async () => {
    seedInventoryItem(db, { item_name: "Business Laptop", deductible: 1 });
    seedInventoryItem(db, { item_name: "Personal Phone", deductible: 0 });

    const result = await caller.inventory.list({ deductible: "false" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].itemName).toBe("Personal Phone");
  });

  it("combines multiple filters", async () => {
    seedInventoryItem(db, {
      item_name: "Office Desk",
      room: "Office",
      type: "Furniture",
      in_use: 1,
    });
    seedInventoryItem(db, {
      item_name: "Office Chair",
      room: "Office",
      type: "Furniture",
      in_use: 0,
    });
    seedInventoryItem(db, { item_name: "Laptop", room: "Office", type: "Electronics", in_use: 1 });

    const result = await caller.inventory.list({
      room: "Office",
      type: "Furniture",
      inUse: "true",
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].itemName).toBe("Office Desk");
  });

  it("paginates with limit and offset", async () => {
    for (let i = 0; i < 10; i++) {
      seedInventoryItem(db, { item_name: `Item ${String(i).padStart(2, "0")}` });
    }

    const page1 = await caller.inventory.list({ limit: 3, offset: 0 });
    expect(page1.data).toHaveLength(3);
    expect(page1.pagination).toEqual({
      total: 10,
      limit: 3,
      offset: 0,
      hasMore: true,
    });

    const page2 = await caller.inventory.list({ limit: 3, offset: 3 });
    expect(page2.data).toHaveLength(3);
    expect(page2.pagination.offset).toBe(3);

    // Names should not overlap
    const page1Names = page1.data.map((i) => i.itemName);
    const page2Names = page2.data.map((i) => i.itemName);
    expect(page1Names).not.toEqual(page2Names);
  });

  it("defaults limit to 50 and offset to 0", async () => {
    const result = await caller.inventory.list({});
    expect(result.pagination.limit).toBe(50);
    expect(result.pagination.offset).toBe(0);
  });

  it("throws UNAUTHORIZED without auth", async () => {
    const unauthCaller = createCaller(false);
    await expect(unauthCaller.inventory.list({})).rejects.toThrow(TRPCError);
    await expect(unauthCaller.inventory.list({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("inventory.get", () => {
  it("returns a single item by ID", async () => {
    const id = seedInventoryItem(db, { item_name: "MacBook Pro" });

    const result = await caller.inventory.get({ id });
    expect(result.data.id).toBe(id);
    expect(result.data.itemName).toBe("MacBook Pro");
  });

  it("throws NOT_FOUND for non-existent ID", async () => {
    await expect(caller.inventory.get({ id: "does-not-exist" })).rejects.toThrow(TRPCError);
    await expect(caller.inventory.get({ id: "does-not-exist" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("inventory.create", () => {
  it("creates an item with required fields only (itemName)", async () => {
    const result = await caller.inventory.create({ itemName: "MacBook Pro" });

    expect(result.message).toBe("Inventory item created");
    expect(result.data.itemName).toBe("MacBook Pro");
    expect(result.data.id).toBeDefined();
    expect(result.data.inUse).toBe(false);
    expect(result.data.deductible).toBe(false);
    expect(result.data.brand).toBeNull();
  });

  it("creates an item with all fields", async () => {
    const result = await caller.inventory.create({
      itemName: "MacBook Pro",
      brand: "Apple",
      model: "M2 Max",
      itemId: "SN123456",
      room: "Office",
      location: "Desk",
      type: "Electronics",
      condition: "Excellent",
      inUse: true,
      deductible: true,
      purchaseDate: "2025-01-15",
      warrantyExpires: "2027-01-15",
      replacementValue: 2500.0,
      resaleValue: 1800.0,
      purchaseTransactionId: "txn-123",
      purchasedFromId: "entity-456",
      purchasedFromName: "Apple Store",
    });

    expect(result.data.itemName).toBe("MacBook Pro");
    expect(result.data.brand).toBe("Apple");
    expect(result.data.model).toBe("M2 Max");
    expect(result.data.itemId).toBe("SN123456");
    expect(result.data.room).toBe("Office");
    expect(result.data.location).toBe("Desk");
    expect(result.data.type).toBe("Electronics");
    expect(result.data.condition).toBe("Excellent");
    expect(result.data.inUse).toBe(true);
    expect(result.data.deductible).toBe(true);
    expect(result.data.purchaseDate).toBe("2025-01-15");
    expect(result.data.warrantyExpires).toBe("2027-01-15");
    expect(result.data.replacementValue).toBe(2500.0);
    expect(result.data.resaleValue).toBe(1800.0);
    expect(result.data.purchaseTransactionId).toBe("txn-123");
    expect(result.data.purchasedFromId).toBe("entity-456");
    expect(result.data.purchasedFromName).toBe("Apple Store");
  });

  it("throws BAD_REQUEST for empty itemName", async () => {
    await expect(caller.inventory.create({ itemName: "" })).rejects.toThrow(TRPCError);
    await expect(caller.inventory.create({ itemName: "" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("throws BAD_REQUEST for missing itemName", async () => {
    // @ts-expect-error - Testing validation with missing required field
    await expect(caller.inventory.create({})).rejects.toThrow(TRPCError);
  });

  it("persists to the database", async () => {
    await caller.inventory.create({ itemName: "New Item" });

    const row = db.prepare("SELECT * FROM home_inventory WHERE item_name = ?").get("New Item");
    expect(row).toBeDefined();
  });

  it("stores boolean fields as INTEGER in DB", async () => {
    await caller.inventory.create({
      itemName: "Test Item",
      inUse: true,
      deductible: false,
    });

    const row = db
      .prepare("SELECT in_use, deductible FROM home_inventory WHERE item_name = ?")
      .get("Test Item") as { in_use: number; deductible: number };
    expect(row.in_use).toBe(1);
    expect(row.deductible).toBe(0);
  });
});

describe("inventory.update", () => {
  it("updates a single field", async () => {
    const id = seedInventoryItem(db, { item_name: "MacBook Pro" });

    const result = await caller.inventory.update({ id, data: { brand: "Apple" } });

    expect(result.message).toBe("Inventory item updated");
    expect(result.data.itemName).toBe("MacBook Pro");
    expect(result.data.brand).toBe("Apple");
  });

  it("updates multiple fields at once", async () => {
    const id = seedInventoryItem(db, { item_name: "MacBook" });

    const result = await caller.inventory.update({
      id,
      data: {
        itemName: "MacBook Pro",
        brand: "Apple",
        model: "M2 Max",
        room: "Office",
      },
    });

    expect(result.data.itemName).toBe("MacBook Pro");
    expect(result.data.brand).toBe("Apple");
    expect(result.data.model).toBe("M2 Max");
    expect(result.data.room).toBe("Office");
  });

  it("clears a field by setting to null", async () => {
    const id = seedInventoryItem(db, { item_name: "MacBook", brand: "Apple" });

    const result = await caller.inventory.update({ id, data: { brand: null } });

    expect(result.data.brand).toBeNull();
  });

  it("updates boolean fields", async () => {
    const id = seedInventoryItem(db, { item_name: "Laptop", in_use: 0, deductible: 0 });

    const result = await caller.inventory.update({
      id,
      data: { inUse: true, deductible: true },
    });

    expect(result.data.inUse).toBe(true);
    expect(result.data.deductible).toBe(true);
  });

  it("updates last_edited_time", async () => {
    const id = seedInventoryItem(db, {
      item_name: "MacBook",
      last_edited_time: "2020-01-01T00:00:00.000Z",
    });

    await caller.inventory.update({ id, data: { brand: "Apple" } });

    const row = db
      .prepare("SELECT last_edited_time FROM home_inventory WHERE id = ?")
      .get(id) as { last_edited_time: string };
    expect(row.last_edited_time).not.toBe("2020-01-01T00:00:00.000Z");
  });

  it("throws NOT_FOUND for non-existent ID", async () => {
    await expect(
      caller.inventory.update({
        id: "does-not-exist",
        data: { itemName: "New Name" },
      })
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.inventory.update({
        id: "does-not-exist",
        data: { itemName: "New Name" },
      })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws BAD_REQUEST for empty itemName", async () => {
    const id = seedInventoryItem(db, { item_name: "MacBook" });

    await expect(caller.inventory.update({ id, data: { itemName: "" } })).rejects.toThrow(
      TRPCError
    );
    await expect(caller.inventory.update({ id, data: { itemName: "" } })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("inventory.delete", () => {
  it("deletes an existing item", async () => {
    const id = seedInventoryItem(db, { item_name: "MacBook Pro" });

    const result = await caller.inventory.delete({ id });
    expect(result.message).toBe("Inventory item deleted");

    // Verify gone from DB
    const row = db.prepare("SELECT * FROM home_inventory WHERE id = ?").get(id);
    expect(row).toBeUndefined();
  });

  it("throws NOT_FOUND for non-existent ID", async () => {
    await expect(caller.inventory.delete({ id: "does-not-exist" })).rejects.toThrow(TRPCError);
    await expect(caller.inventory.delete({ id: "does-not-exist" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("is idempotent — second delete throws NOT_FOUND", async () => {
    const id = seedInventoryItem(db, { item_name: "MacBook Pro" });

    await caller.inventory.delete({ id });
    await expect(caller.inventory.delete({ id })).rejects.toThrow(TRPCError);
    await expect(caller.inventory.delete({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
