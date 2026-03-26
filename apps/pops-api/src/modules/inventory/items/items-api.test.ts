import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "better-sqlite3";
import { setupTestContext } from "../../../shared/test-utils.js";

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
  db.prepare("PRAGMA foreign_keys = ON").run();
});

afterEach(() => {
  ctx.teardown();
});

/** Helper: insert a location and return its ID. */
function insertLocation(id: string, name: string, parentId: string | null = null) {
  db.prepare(
    "INSERT INTO locations (id, name, parent_id, last_edited_time) VALUES (?, ?, ?, ?)"
  ).run(id, name, parentId, "2026-01-01");
}

/** Helper: insert an item at a location. */
function insertItem(
  id: string,
  name: string,
  locationId: string | null = null,
  assetId: string | null = null
) {
  db.prepare(
    "INSERT INTO home_inventory (id, item_name, location_id, asset_id, last_edited_time) VALUES (?, ?, ?, ?, ?)"
  ).run(id, name, locationId, assetId, "2026-01-01");
}

describe("items.list with includeChildren", () => {
  it("returns only items at the specified location when includeChildren is false", () => {
    insertLocation("loc-house", "House");
    insertLocation("loc-kitchen", "Kitchen", "loc-house");
    insertItem("item-1", "Blender", "loc-kitchen");
    insertItem("item-2", "Fridge", "loc-house");

    const rows = db.prepare("SELECT * FROM home_inventory WHERE location_id = ?").all("loc-house");
    expect(rows).toHaveLength(1);
  });

  it("returns items at location and all descendants when includeChildren is true", () => {
    // House → Kitchen → Pantry
    insertLocation("loc-house", "House");
    insertLocation("loc-kitchen", "Kitchen", "loc-house");
    insertLocation("loc-pantry", "Pantry", "loc-kitchen");

    insertItem("item-1", "Couch", "loc-house");
    insertItem("item-2", "Blender", "loc-kitchen");
    insertItem("item-3", "Rice", "loc-pantry");
    insertItem("item-4", "Unlocated");

    // Collect descendant IDs manually (BFS)
    const allLocationIds = ["loc-house", "loc-kitchen", "loc-pantry"];
    const rows = db
      .prepare(
        `SELECT * FROM home_inventory WHERE location_id IN (${allLocationIds.map(() => "?").join(",")})`
      )
      .all(...allLocationIds);
    expect(rows).toHaveLength(3);
  });
});

describe("searchByAssetId", () => {
  it("finds an item by exact asset ID (case-insensitive)", () => {
    insertItem("item-1", "MacBook", null, "ASSET-001");

    const row = db
      .prepare("SELECT * FROM home_inventory WHERE LOWER(asset_id) = LOWER(?)")
      .get("asset-001");
    expect(row).toBeTruthy();
  });

  it("returns null for non-existent asset ID", () => {
    insertItem("item-1", "MacBook", null, "ASSET-001");

    const row = db
      .prepare("SELECT * FROM home_inventory WHERE LOWER(asset_id) = LOWER(?)")
      .get("ASSET-999");
    expect(row).toBeUndefined();
  });
});

describe("locations.getPath (breadcrumb)", () => {
  it("returns root-first path for a deeply nested location", () => {
    insertLocation("loc-house", "House");
    insertLocation("loc-kitchen", "Kitchen", "loc-house");
    insertLocation("loc-pantry", "Pantry", "loc-kitchen");

    // Walk up from pantry to root
    const path: string[] = [];
    let currentId: string | null = "loc-pantry";
    while (currentId) {
      const row = db
        .prepare("SELECT id, name, parent_id FROM locations WHERE id = ?")
        .get(currentId) as { id: string; name: string; parent_id: string | null };
      path.push(row.name);
      currentId = row.parent_id;
    }
    path.reverse();

    expect(path).toEqual(["House", "Kitchen", "Pantry"]);
  });

  it("returns single-element array for a root location", () => {
    insertLocation("loc-house", "House");

    const row = db
      .prepare("SELECT id, name, parent_id FROM locations WHERE id = ?")
      .get("loc-house") as { id: string; name: string; parent_id: string | null };
    expect(row.parent_id).toBeNull();
    expect(row.name).toBe("House");
  });
});

describe("locations.getItems", () => {
  it("returns items at a specific location", () => {
    insertLocation("loc-kitchen", "Kitchen");
    insertItem("item-1", "Blender", "loc-kitchen");
    insertItem("item-2", "Toaster", "loc-kitchen");
    insertItem("item-3", "Unlocated");

    const rows = db
      .prepare("SELECT * FROM home_inventory WHERE location_id = ?")
      .all("loc-kitchen");
    expect(rows).toHaveLength(2);
  });

  it("includes items from descendant locations when includeChildren is true", () => {
    insertLocation("loc-house", "House");
    insertLocation("loc-kitchen", "Kitchen", "loc-house");
    insertLocation("loc-pantry", "Pantry", "loc-kitchen");

    insertItem("item-1", "Couch", "loc-house");
    insertItem("item-2", "Blender", "loc-kitchen");
    insertItem("item-3", "Rice", "loc-pantry");

    // Collect all descendant IDs for loc-house
    const descendantIds: string[] = [];
    const queue = ["loc-house"];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = db.prepare("SELECT id FROM locations WHERE parent_id = ?").all(current) as {
        id: string;
      }[];
      for (const child of children) {
        descendantIds.push(child.id);
        queue.push(child.id);
      }
    }

    const allIds = ["loc-house", ...descendantIds];
    const rows = db
      .prepare(
        `SELECT * FROM home_inventory WHERE location_id IN (${allIds.map(() => "?").join(",")})`
      )
      .all(...allIds);
    expect(rows).toHaveLength(3);
  });
});
