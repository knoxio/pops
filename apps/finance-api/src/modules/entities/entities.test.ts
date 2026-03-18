import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Database } from "better-sqlite3";
import { setupTestContext, seedEntity, createCaller } from "../../shared/test-utils.js";

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe("entities.list", () => {
  it("returns empty list when no entities exist", async () => {
    const result = await caller.entities.list({});
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.hasMore).toBe(false);
  });

  it("returns all entities with correct shape", async () => {
    seedEntity(db, { name: "Woolworths", type: "Retailer" });
    seedEntity(db, { name: "Coles", type: "Retailer" });

    const result = await caller.entities.list({});
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);

    // Sorted by name
    expect(result.data[0].name).toBe("Coles");
    expect(result.data[1].name).toBe("Woolworths");
  });

  it("returns camelCase fields", async () => {
    seedEntity(db, {
      name: "Woolworths",
      type: "Retailer",
      default_transaction_type: "Purchase",
      default_tags: '["Groceries"]',
      last_edited_time: "2025-06-15T10:00:00.000Z",
    });

    const result = await caller.entities.list({});
    const entity = result.data[0];
    expect(entity).toHaveProperty("id");
    expect(entity).toHaveProperty("defaultTransactionType", "Purchase");
    expect(entity).toHaveProperty("defaultTags", ["Groceries"]);
    expect(entity).toHaveProperty("lastEditedTime", "2025-06-15T10:00:00.000Z");
    // No snake_case leaking
    expect(entity).not.toHaveProperty("notion_id");
    expect(entity).not.toHaveProperty("last_edited_time");
  });

  it("splits comma-separated aliases into array", async () => {
    seedEntity(db, { name: "Woolworths", aliases: "Woolies, WW, Woolworths Group" });

    const result = await caller.entities.list({});
    expect(result.data[0].aliases).toEqual(["Woolies", "WW", "Woolworths Group"]);
  });

  it("returns empty aliases array when null", async () => {
    seedEntity(db, { name: "Woolworths", aliases: null });

    const result = await caller.entities.list({});
    expect(result.data[0].aliases).toEqual([]);
  });

  it("filters by search (case-insensitive LIKE)", async () => {
    seedEntity(db, { name: "Woolworths" });
    seedEntity(db, { name: "Coles" });
    seedEntity(db, { name: "Aldi" });

    const result = await caller.entities.list({ search: "wool" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe("Woolworths");
    expect(result.pagination.total).toBe(1);
  });

  it("filters by type", async () => {
    seedEntity(db, { name: "Woolworths", type: "Retailer" });
    seedEntity(db, { name: "ATO", type: "Government" });

    const result = await caller.entities.list({ type: "Government" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe("ATO");
  });

  it("paginates with limit and offset", async () => {
    for (let i = 0; i < 10; i++) {
      seedEntity(db, { name: `Entity ${String(i).padStart(2, "0")}` });
    }

    const page1 = await caller.entities.list({ limit: 3, offset: 0 });
    expect(page1.data).toHaveLength(3);
    expect(page1.pagination).toEqual({
      total: 10,
      limit: 3,
      offset: 0,
      hasMore: true,
    });

    const page2 = await caller.entities.list({ limit: 3, offset: 3 });
    expect(page2.data).toHaveLength(3);
    expect(page2.pagination.offset).toBe(3);

    // Names should not overlap
    const page1Names = page1.data.map((e) => e.name);
    const page2Names = page2.data.map((e) => e.name);
    expect(page1Names).not.toEqual(page2Names);
  });

  it("defaults limit to 50 and offset to 0", async () => {
    const result = await caller.entities.list({});
    expect(result.pagination.limit).toBe(50);
    expect(result.pagination.offset).toBe(0);
  });

  it("throws UNAUTHORIZED without auth", async () => {
    const unauthCaller = createCaller(false);
    await expect(unauthCaller.entities.list({})).rejects.toThrow(TRPCError);
    await expect(unauthCaller.entities.list({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("entities.get", () => {
  it("returns a single entity by ID", async () => {
    const id = seedEntity(db, { name: "Woolworths" });

    const result = await caller.entities.get({ id });
    expect(result.data.id).toBe(id);
    expect(result.data.name).toBe("Woolworths");
  });

  it("throws NOT_FOUND for non-existent ID", async () => {
    await expect(caller.entities.get({ id: "does-not-exist" })).rejects.toThrow(TRPCError);
    await expect(caller.entities.get({ id: "does-not-exist" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("entities.create", () => {
  it("creates an entity with required fields only", async () => {
    const result = await caller.entities.create({ name: "Woolworths" });

    expect(result.message).toBe("Entity created");
    expect(result.data.name).toBe("Woolworths");
    expect(result.data.id).toBeDefined();
    expect(result.data.aliases).toEqual([]);
    expect(result.data.type).toBeNull();
  });

  it("creates an entity with all fields", async () => {
    const result = await caller.entities.create({
      name: "Woolworths",
      type: "Retailer",
      abn: "88000014675",
      aliases: ["Woolies", "WW"],
      defaultTransactionType: "Purchase",
      defaultTags: ["Groceries"],
      notes: "Supermarket chain",
    });

    expect(result.data.name).toBe("Woolworths");
    expect(result.data.type).toBe("Retailer");
    expect(result.data.abn).toBe("88000014675");
    expect(result.data.aliases).toEqual(["Woolies", "WW"]);
    expect(result.data.defaultTransactionType).toBe("Purchase");
    expect(result.data.defaultTags).toEqual(["Groceries"]);
    expect(result.data.notes).toBe("Supermarket chain");
  });

  it("throws CONFLICT for duplicate entity name", async () => {
    seedEntity(db, { name: "Woolworths" });

    await expect(caller.entities.create({ name: "Woolworths" })).rejects.toThrow(TRPCError);
    await expect(caller.entities.create({ name: "Woolworths" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("throws BAD_REQUEST for empty name", async () => {
    await expect(caller.entities.create({ name: "" })).rejects.toThrow(TRPCError);
    await expect(caller.entities.create({ name: "" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("throws BAD_REQUEST for missing name", async () => {
    // @ts-expect-error - Testing validation with missing required field
    await expect(caller.entities.create({})).rejects.toThrow(TRPCError);
  });

  it("persists to the database", async () => {
    await caller.entities.create({ name: "New Entity" });

    const row = db.prepare("SELECT * FROM entities WHERE name = ?").get("New Entity");
    expect(row).toBeDefined();
  });
});

describe("entities.update", () => {
  it("updates a single field", async () => {
    const id = seedEntity(db, { name: "Woolworths" });

    const result = await caller.entities.update({ id, data: { type: "Retailer" } });

    expect(result.message).toBe("Entity updated");
    expect(result.data.name).toBe("Woolworths");
    expect(result.data.type).toBe("Retailer");
  });

  it("updates multiple fields at once", async () => {
    const id = seedEntity(db, { name: "Woolworths" });

    const result = await caller.entities.update({
      id,
      data: {
        name: "Woolworths Group",
        type: "Retailer",
        aliases: ["Woolies", "WW"],
      },
    });

    expect(result.data.name).toBe("Woolworths Group");
    expect(result.data.type).toBe("Retailer");
    expect(result.data.aliases).toEqual(["Woolies", "WW"]);
  });

  it("clears a field by setting to null", async () => {
    const id = seedEntity(db, { name: "Woolworths", type: "Retailer" });

    const result = await caller.entities.update({ id, data: { type: null } });

    expect(result.data.type).toBeNull();
  });

  it("updates last_edited_time", async () => {
    const id = seedEntity(db, {
      name: "Woolworths",
      last_edited_time: "2020-01-01T00:00:00.000Z",
    });

    await caller.entities.update({ id, data: { type: "Retailer" } });

    const row = db.prepare("SELECT last_edited_time FROM entities WHERE id = ?").get(id) as {
      last_edited_time: string;
    };
    expect(row.last_edited_time).not.toBe("2020-01-01T00:00:00.000Z");
  });

  it("throws NOT_FOUND for non-existent ID", async () => {
    await expect(
      caller.entities.update({
        id: "does-not-exist",
        data: { name: "New Name" },
      })
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.entities.update({
        id: "does-not-exist",
        data: { name: "New Name" },
      })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws BAD_REQUEST for empty name", async () => {
    const id = seedEntity(db, { name: "Woolworths" });

    await expect(caller.entities.update({ id, data: { name: "" } })).rejects.toThrow(TRPCError);
    await expect(caller.entities.update({ id, data: { name: "" } })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("entities.delete", () => {
  it("deletes an existing entity", async () => {
    const id = seedEntity(db, { name: "Woolworths" });

    const result = await caller.entities.delete({ id });
    expect(result.message).toBe("Entity deleted");

    // Verify gone from DB
    const row = db.prepare("SELECT * FROM entities WHERE id = ?").get(id);
    expect(row).toBeUndefined();
  });

  it("throws NOT_FOUND for non-existent ID", async () => {
    await expect(caller.entities.delete({ id: "does-not-exist" })).rejects.toThrow(TRPCError);
    await expect(caller.entities.delete({ id: "does-not-exist" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("is idempotent — second delete throws NOT_FOUND", async () => {
    const id = seedEntity(db, { name: "Woolworths" });

    await caller.entities.delete({ id });
    await expect(caller.entities.delete({ id })).rejects.toThrow(TRPCError);
    await expect(caller.entities.delete({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
