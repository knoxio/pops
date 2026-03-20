import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Database } from "better-sqlite3";
import { setupTestContext, seedLocation, createCaller } from "../../../shared/test-utils.js";

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe("inventory.locations.list", () => {
  it("returns empty list when no locations exist", async () => {
    const result = await caller.inventory.locations.list();
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("returns all locations sorted by sortOrder then name", async () => {
    seedLocation(db, { name: "Bedroom", sort_order: 1 });
    seedLocation(db, { name: "Kitchen", sort_order: 0 });
    seedLocation(db, { name: "Living Room", sort_order: 0 });

    const result = await caller.inventory.locations.list();
    expect(result.data).toHaveLength(3);
    expect(result.data[0].name).toBe("Kitchen");
    expect(result.data[1].name).toBe("Living Room");
    expect(result.data[2].name).toBe("Bedroom");
  });
});

describe("inventory.locations.get", () => {
  it("returns a location by ID", async () => {
    const id = seedLocation(db, { name: "Home" });
    const result = await caller.inventory.locations.get({ id });
    expect(result.data.name).toBe("Home");
    expect(result.data.parentId).toBeNull();
  });

  it("throws NOT_FOUND for missing ID", async () => {
    await expect(caller.inventory.locations.get({ id: "nonexistent" })).rejects.toThrow(TRPCError);
  });
});

describe("inventory.locations.tree", () => {
  it("returns empty tree when no locations exist", async () => {
    const result = await caller.inventory.locations.tree();
    expect(result.data).toEqual([]);
  });

  it("returns flat list as root nodes when no parents", async () => {
    seedLocation(db, { name: "Home" });
    seedLocation(db, { name: "Car" });

    const result = await caller.inventory.locations.tree();
    expect(result.data).toHaveLength(2);
    expect(result.data[0].children).toEqual([]);
    expect(result.data[1].children).toEqual([]);
  });

  it("builds nested tree from parent-child relationships", async () => {
    const homeId = seedLocation(db, { name: "Home" });
    const kitchenId = seedLocation(db, { name: "Kitchen", parent_id: homeId });
    seedLocation(db, { name: "Pantry", parent_id: kitchenId });
    seedLocation(db, { name: "Bedroom", parent_id: homeId });

    const result = await caller.inventory.locations.tree();
    expect(result.data).toHaveLength(1); // Only Home is root

    const home = result.data[0];
    expect(home.name).toBe("Home");
    expect(home.children).toHaveLength(2); // Kitchen, Bedroom

    const kitchen = home.children.find((c) => c.name === "Kitchen");
    expect(kitchen).toBeDefined();
    expect(kitchen?.children).toHaveLength(1); // Pantry
    expect(kitchen?.children[0].name).toBe("Pantry");
  });
});

describe("inventory.locations.children", () => {
  it("returns direct children of a location", async () => {
    const homeId = seedLocation(db, { name: "Home" });
    seedLocation(db, { name: "Kitchen", parent_id: homeId });
    seedLocation(db, { name: "Bedroom", parent_id: homeId });
    seedLocation(db, { name: "Car" }); // Not a child

    const result = await caller.inventory.locations.children({ parentId: homeId });
    expect(result.data).toHaveLength(2);
  });
});

describe("inventory.locations.create", () => {
  it("creates a root location", async () => {
    const result = await caller.inventory.locations.create({ name: "Home" });
    expect(result.data.name).toBe("Home");
    expect(result.data.parentId).toBeNull();
    expect(result.data.sortOrder).toBe(0);
  });

  it("creates a child location", async () => {
    const parent = await caller.inventory.locations.create({ name: "Home" });
    const child = await caller.inventory.locations.create({
      name: "Kitchen",
      parentId: parent.data.id,
    });
    expect(child.data.parentId).toBe(parent.data.id);
  });

  it("creates with custom sort order", async () => {
    const result = await caller.inventory.locations.create({
      name: "Garage",
      sortOrder: 5,
    });
    expect(result.data.sortOrder).toBe(5);
  });

  it("throws NOT_FOUND when parentId does not exist", async () => {
    await expect(
      caller.inventory.locations.create({ name: "Child", parentId: "nonexistent" })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects empty name", async () => {
    await expect(caller.inventory.locations.create({ name: "" })).rejects.toThrow();
  });
});

describe("inventory.locations.update", () => {
  it("renames a location", async () => {
    const id = seedLocation(db, { name: "Bedoom" });
    const result = await caller.inventory.locations.update({
      id,
      data: { name: "Bedroom" },
    });
    expect(result.data.name).toBe("Bedroom");
  });

  it("moves a location to a new parent", async () => {
    const homeId = seedLocation(db, { name: "Home" });
    const garageId = seedLocation(db, { name: "Garage" });
    const shelfId = seedLocation(db, { name: "Shelf", parent_id: homeId });

    const result = await caller.inventory.locations.update({
      id: shelfId,
      data: { parentId: garageId },
    });
    expect(result.data.parentId).toBe(garageId);
  });

  it("moves a location to root", async () => {
    const homeId = seedLocation(db, { name: "Home" });
    const roomId = seedLocation(db, { name: "Room", parent_id: homeId });

    const result = await caller.inventory.locations.update({
      id: roomId,
      data: { parentId: null },
    });
    expect(result.data.parentId).toBeNull();
  });

  it("rejects setting parentId to self", async () => {
    const id = seedLocation(db, { name: "Home" });
    await expect(
      caller.inventory.locations.update({ id, data: { parentId: id } })
    ).rejects.toThrow();
  });

  it("rejects circular reference", async () => {
    const parentId = seedLocation(db, { name: "Parent" });
    const childId = seedLocation(db, { name: "Child", parent_id: parentId });

    // Try to make parent a child of its own child
    await expect(
      caller.inventory.locations.update({ id: parentId, data: { parentId: childId } })
    ).rejects.toThrow();
  });

  it("throws NOT_FOUND for missing location", async () => {
    await expect(
      caller.inventory.locations.update({ id: "nonexistent", data: { name: "New" } })
    ).rejects.toThrow(TRPCError);
  });
});

describe("inventory.locations.delete", () => {
  it("deletes a location", async () => {
    const id = seedLocation(db, { name: "Temp" });
    const result = await caller.inventory.locations.delete({ id });
    expect(result.message).toBe("Location deleted");

    // Verify it's gone
    await expect(caller.inventory.locations.get({ id })).rejects.toThrow(TRPCError);
  });

  it("cascade deletes children", async () => {
    const parentId = seedLocation(db, { name: "Home" });
    const childId = seedLocation(db, { name: "Kitchen", parent_id: parentId });
    seedLocation(db, { name: "Pantry", parent_id: childId });

    await caller.inventory.locations.delete({ id: parentId });

    // All should be gone
    const list = await caller.inventory.locations.list();
    expect(list.data).toHaveLength(0);
  });

  it("throws NOT_FOUND for missing ID", async () => {
    await expect(caller.inventory.locations.delete({ id: "nonexistent" })).rejects.toThrow(
      TRPCError
    );
  });
});
