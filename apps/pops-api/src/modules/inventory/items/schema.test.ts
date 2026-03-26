import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "better-sqlite3";
import { setupTestContext } from "../../../shared/test-utils.js";

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe("items and locations schema", () => {
  describe("table creation", () => {
    it("creates home_inventory table with all required columns", () => {
      const columns = db.prepare("PRAGMA table_info(home_inventory)").all() as {
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
      }[];
      const columnNames = columns.map((c) => c.name);

      // All 18 target columns (plus legacy columns retained for migration compat)
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("item_name");
      expect(columnNames).toContain("type");
      expect(columnNames).toContain("brand");
      expect(columnNames).toContain("model");
      expect(columnNames).toContain("asset_id");
      expect(columnNames).toContain("location_id");
      expect(columnNames).toContain("condition");
      expect(columnNames).toContain("purchase_date");
      expect(columnNames).toContain("purchase_price");
      expect(columnNames).toContain("replacement_value");
      expect(columnNames).toContain("resale_value");
      expect(columnNames).toContain("warranty_expires");
      expect(columnNames).toContain("notes");
      expect(columnNames).toContain("purchase_transaction_id");
      expect(columnNames).toContain("purchased_from_id");
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("updated_at");
    });

    it("creates locations table with required columns", () => {
      const columns = db.prepare("PRAGMA table_info(locations)").all() as { name: string }[];
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain("id");
      expect(columnNames).toContain("name");
      expect(columnNames).toContain("parent_id");
      expect(columnNames).toContain("sort_order");
    });
  });

  describe("defaults", () => {
    it("defaults condition to 'good'", () => {
      db.prepare(
        "INSERT INTO home_inventory (id, item_name, last_edited_time) VALUES ('item-1', 'Test', '2026-01-01')"
      ).run();

      const row = db.prepare("SELECT condition FROM home_inventory WHERE id = 'item-1'").get() as {
        condition: string;
      };
      expect(row.condition).toBe("good");
    });

    it("defaults created_at and updated_at to current timestamp", () => {
      db.prepare(
        "INSERT INTO home_inventory (id, item_name, last_edited_time) VALUES ('item-2', 'Test', '2026-01-01')"
      ).run();

      const row = db
        .prepare("SELECT created_at, updated_at FROM home_inventory WHERE id = 'item-2'")
        .get() as { created_at: string; updated_at: string };
      expect(row.created_at).toBeTruthy();
      expect(row.updated_at).toBeTruthy();
    });
  });

  describe("FK cascade behaviour", () => {
    it("sets location_id to NULL when location is deleted", () => {
      db.prepare("PRAGMA foreign_keys = ON").run();

      db.prepare(
        "INSERT INTO locations (id, name, last_edited_time) VALUES ('loc-1', 'Kitchen', '2026-01-01')"
      ).run();
      db.prepare(
        "INSERT INTO home_inventory (id, item_name, location_id, last_edited_time) VALUES ('item-3', 'Blender', 'loc-1', '2026-01-01')"
      ).run();

      // Delete the location
      db.prepare("DELETE FROM locations WHERE id = 'loc-1'").run();

      const row = db
        .prepare("SELECT location_id FROM home_inventory WHERE id = 'item-3'")
        .get() as { location_id: string | null };
      expect(row.location_id).toBeNull();
    });

    it("deletes child locations when parent is deleted (CASCADE)", () => {
      db.prepare("PRAGMA foreign_keys = ON").run();

      db.prepare(
        "INSERT INTO locations (id, name, last_edited_time) VALUES ('loc-parent', 'House', '2026-01-01')"
      ).run();
      db.prepare(
        "INSERT INTO locations (id, name, parent_id, last_edited_time) VALUES ('loc-child', 'Kitchen', 'loc-parent', '2026-01-01')"
      ).run();

      db.prepare("DELETE FROM locations WHERE id = 'loc-parent'").run();

      const count = db
        .prepare("SELECT COUNT(*) as cnt FROM locations WHERE id = 'loc-child'")
        .get() as { cnt: number };
      expect(count.cnt).toBe(0);
    });
  });

  describe("unique constraint on asset_id", () => {
    it("enforces unique asset_id", () => {
      db.prepare(
        "INSERT INTO home_inventory (id, item_name, asset_id, last_edited_time) VALUES ('item-a', 'Item A', 'ASSET-001', '2026-01-01')"
      ).run();

      expect(() => {
        db.prepare(
          "INSERT INTO home_inventory (id, item_name, asset_id, last_edited_time) VALUES ('item-b', 'Item B', 'ASSET-001', '2026-01-01')"
        ).run();
      }).toThrow();
    });

    it("allows multiple NULL asset_ids", () => {
      db.prepare(
        "INSERT INTO home_inventory (id, item_name, last_edited_time) VALUES ('item-c', 'Item C', '2026-01-01')"
      ).run();
      db.prepare(
        "INSERT INTO home_inventory (id, item_name, last_edited_time) VALUES ('item-d', 'Item D', '2026-01-01')"
      ).run();

      const count = db
        .prepare("SELECT COUNT(*) as cnt FROM home_inventory WHERE asset_id IS NULL")
        .get() as { cnt: number };
      expect(count.cnt).toBe(2);
    });
  });

  describe("index existence", () => {
    it("has all required indexes on home_inventory", () => {
      const indexes = db.prepare("PRAGMA index_list(home_inventory)").all() as { name: string }[];
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain("idx_inventory_asset_id");
      expect(indexNames).toContain("idx_inventory_name");
      expect(indexNames).toContain("idx_inventory_location");
      expect(indexNames).toContain("idx_inventory_type");
      expect(indexNames).toContain("idx_inventory_warranty");
    });

    it("has all required indexes on locations", () => {
      const indexes = db.prepare("PRAGMA index_list(locations)").all() as { name: string }[];
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain("idx_locations_parent");
      expect(indexNames).toContain("idx_locations_parent_sort");
    });

    it("idx_locations_parent_sort is a composite index on (parent_id, sort_order)", () => {
      const cols = db.prepare("PRAGMA index_info(idx_locations_parent_sort)").all() as {
        name: string;
        seqno: number;
      }[];

      expect(cols).toHaveLength(2);
      expect(cols[0]!.name).toBe("parent_id");
      expect(cols[1]!.name).toBe("sort_order");
    });
  });
});
