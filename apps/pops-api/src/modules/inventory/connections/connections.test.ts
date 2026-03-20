/**
 * Item connections router tests.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "better-sqlite3";
import { TRPCError } from "@trpc/server";
import {
  setupTestContext,
  createCaller,
  seedInventoryItem,
  seedItemConnection,
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

/** Seed two items and return their IDs (sorted for A<B). */
function seedTwoItems(nameA = "Item A", nameB = "Item B") {
  const idA = seedInventoryItem(db, { item_name: nameA });
  const idB = seedInventoryItem(db, { item_name: nameB });
  return [idA, idB].sort() as [string, string];
}

describe("inventory.connections.connect", () => {
  it("connects two items and returns the connection", async () => {
    const [idA, idB] = seedTwoItems();

    const result = await caller.inventory.connections.connect({
      itemAId: idA,
      itemBId: idB,
    });

    expect(result.data).toMatchObject({
      itemAId: idA,
      itemBId: idB,
    });
    expect(result.data.id).toBeTypeOf("number");
    expect(result.data.createdAt).toBeTypeOf("string");
    expect(result.message).toBe("Items connected");
  });

  it("auto-orders A<B when inputs are reversed", async () => {
    const [idA, idB] = seedTwoItems();

    // Pass in reverse order (B first, A second)
    const result = await caller.inventory.connections.connect({
      itemAId: idB,
      itemBId: idA,
    });

    // Should be stored with A<B ordering
    expect(result.data.itemAId).toBe(idA);
    expect(result.data.itemBId).toBe(idB);
  });

  it("throws CONFLICT when connecting same pair twice", async () => {
    const [idA, idB] = seedTwoItems();

    await caller.inventory.connections.connect({ itemAId: idA, itemBId: idB });

    await expect(
      caller.inventory.connections.connect({ itemAId: idA, itemBId: idB })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.connections.connect({ itemAId: idA, itemBId: idB });
    } catch (err) {
      expect((err as TRPCError).code).toBe("CONFLICT");
    }
  });

  it("throws CONFLICT when connecting same pair in reverse order", async () => {
    const [idA, idB] = seedTwoItems();

    await caller.inventory.connections.connect({ itemAId: idA, itemBId: idB });

    await expect(
      caller.inventory.connections.connect({ itemAId: idB, itemBId: idA })
    ).rejects.toThrow(TRPCError);
  });

  it("throws CONFLICT when connecting an item to itself", async () => {
    const id = seedInventoryItem(db, { item_name: "Solo Item" });

    await expect(
      caller.inventory.connections.connect({ itemAId: id, itemBId: id })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.connections.connect({ itemAId: id, itemBId: id });
    } catch (err) {
      expect((err as TRPCError).code).toBe("CONFLICT");
    }
  });

  it("throws NOT_FOUND when item A does not exist", async () => {
    const idB = seedInventoryItem(db, { item_name: "Real Item" });

    await expect(
      caller.inventory.connections.connect({ itemAId: "nonexistent", itemBId: idB })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.connections.connect({ itemAId: "nonexistent", itemBId: idB });
    } catch (err) {
      expect((err as TRPCError).code).toBe("NOT_FOUND");
    }
  });

  it("throws NOT_FOUND when item B does not exist", async () => {
    const idA = seedInventoryItem(db, { item_name: "Real Item" });

    await expect(
      caller.inventory.connections.connect({ itemAId: idA, itemBId: "nonexistent" })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.connections.connect({ itemAId: idA, itemBId: "nonexistent" });
    } catch (err) {
      expect((err as TRPCError).code).toBe("NOT_FOUND");
    }
  });

  it("persists to the database", async () => {
    const [idA, idB] = seedTwoItems();

    await caller.inventory.connections.connect({ itemAId: idA, itemBId: idB });

    const row = db
      .prepare("SELECT * FROM item_connections WHERE item_a_id = ? AND item_b_id = ?")
      .get(idA, idB) as { item_a_id: string; item_b_id: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.item_a_id).toBe(idA);
    expect(row!.item_b_id).toBe(idB);
  });
});

describe("inventory.connections.disconnect", () => {
  it("removes an existing connection", async () => {
    const [idA, idB] = seedTwoItems();
    const connId = seedItemConnection(db, idA, idB);

    const result = await caller.inventory.connections.disconnect({ id: connId });

    expect(result.message).toBe("Items disconnected");

    const row = db.prepare("SELECT * FROM item_connections WHERE id = ?").get(connId);
    expect(row).toBeUndefined();
  });

  it("throws NOT_FOUND for nonexistent connection", async () => {
    await expect(caller.inventory.connections.disconnect({ id: 999 })).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.connections.disconnect({ id: 999 });
    } catch (err) {
      expect((err as TRPCError).code).toBe("NOT_FOUND");
    }
  });
});

describe("inventory.connections.listForItem", () => {
  it("returns empty list when no connections exist", async () => {
    const id = seedInventoryItem(db, { item_name: "Lonely Item" });

    const result = await caller.inventory.connections.listForItem({ itemId: id });

    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it("returns connections where item is in A column", async () => {
    const [idA, idB] = seedTwoItems("AAA", "ZZZ");
    seedItemConnection(db, idA, idB);

    const result = await caller.inventory.connections.listForItem({ itemId: idA });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].itemAId).toBe(idA);
    expect(result.data[0].itemBId).toBe(idB);
  });

  it("returns connections where item is in B column", async () => {
    const [idA, idB] = seedTwoItems("AAA", "ZZZ");
    seedItemConnection(db, idA, idB);

    const result = await caller.inventory.connections.listForItem({ itemId: idB });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].itemAId).toBe(idA);
    expect(result.data[0].itemBId).toBe(idB);
  });

  it("returns multiple connections for an item", async () => {
    const idA = seedInventoryItem(db, { item_name: "Hub" });
    const idB = seedInventoryItem(db, { item_name: "Device 1" });
    const idC = seedInventoryItem(db, { item_name: "Device 2" });

    // Manually sort pairs for A<B
    const pairAB = [idA, idB].sort() as [string, string];
    const pairAC = [idA, idC].sort() as [string, string];

    seedItemConnection(db, pairAB[0], pairAB[1]);
    seedItemConnection(db, pairAC[0], pairAC[1]);

    const result = await caller.inventory.connections.listForItem({ itemId: idA });

    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
  });

  it("paginates results", async () => {
    const idA = seedInventoryItem(db, { item_name: "Hub" });
    const items: string[] = [];

    for (let i = 0; i < 3; i++) {
      items.push(seedInventoryItem(db, { item_name: `Device ${i}` }));
    }

    for (const idB of items) {
      const pair = [idA, idB].sort() as [string, string];
      seedItemConnection(db, pair[0], pair[1]);
    }

    const page1 = await caller.inventory.connections.listForItem({
      itemId: idA,
      limit: 2,
      offset: 0,
    });

    expect(page1.data).toHaveLength(2);
    expect(page1.pagination.total).toBe(3);
    expect(page1.pagination.hasMore).toBe(true);

    const page2 = await caller.inventory.connections.listForItem({
      itemId: idA,
      limit: 2,
      offset: 2,
    });

    expect(page2.data).toHaveLength(1);
    expect(page2.pagination.hasMore).toBe(false);
  });
});

describe("inventory.connections auth", () => {
  it("throws UNAUTHORIZED without auth on connect", async () => {
    const unauthCaller = createCaller(false);
    await expect(
      unauthCaller.inventory.connections.connect({ itemAId: "a", itemBId: "b" })
    ).rejects.toThrow(TRPCError);
  });

  it("throws UNAUTHORIZED without auth on disconnect", async () => {
    const unauthCaller = createCaller(false);
    await expect(unauthCaller.inventory.connections.disconnect({ id: 1 })).rejects.toThrow(
      TRPCError
    );
  });

  it("throws UNAUTHORIZED without auth on listForItem", async () => {
    const unauthCaller = createCaller(false);
    await expect(unauthCaller.inventory.connections.listForItem({ itemId: "a" })).rejects.toThrow(
      TRPCError
    );
  });
});
