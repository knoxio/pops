/**
 * Corrections module tests — CRUD, pattern matching, and tags.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupTestContext, seedEntity } from "../../../shared/test-utils.js";

const ctx = setupTestContext();

describe("corrections", () => {
  let caller: ReturnType<typeof ctx.setup>["caller"];
  let db: ReturnType<typeof ctx.setup>["db"];

  beforeEach(() => {
    const result = ctx.setup();
    caller = result.caller;
    db = result.db;
  });

  afterEach(() => {
    ctx.teardown();
  });

  describe("createOrUpdate", () => {
    it("creates a new correction", async () => {
      const result = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "WOOLWORTHS",
        matchType: "contains",
        tags: ["Groceries"],
      });

      expect(result.data.descriptionPattern).toBe("WOOLWORTHS");
      expect(result.data.matchType).toBe("contains");
      expect(result.data.tags).toEqual(["Groceries"]);
      expect(result.data.confidence).toBe(0.5);
      expect(result.data.timesApplied).toBe(0);
    });

    it("updates an existing correction on re-create, increasing confidence", async () => {
      await caller.core.corrections.createOrUpdate({
        descriptionPattern: "WOOLWORTHS",
        matchType: "contains",
        tags: ["Groceries"],
      });

      const result = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "WOOLWORTHS",
        matchType: "contains",
        tags: ["Groceries", "Online"],
      });

      // Confidence should increase by 0.1
      expect(result.data.confidence).toBeCloseTo(0.6);
      expect(result.data.timesApplied).toBe(1);
      // tags should be updated
      expect(result.data.tags).toEqual(["Groceries", "Online"]);
    });

    it("normalizes pattern to uppercase with numbers stripped", async () => {
      const result = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "woolworths 1234",
        matchType: "exact",
        tags: ["Groceries"],
      });

      // Pattern is normalized: uppercase, numbers removed, trimmed
      expect(result.data.descriptionPattern).toBe("WOOLWORTHS");
    });
  });

  describe("findMatch", () => {
    beforeEach(async () => {
      await caller.core.corrections.createOrUpdate({
        descriptionPattern: "WOOLWORTHS",
        matchType: "contains",
        tags: ["Groceries"],
      });
      await caller.core.corrections.createOrUpdate({
        descriptionPattern: "NETFLIX",
        matchType: "exact",
        tags: ["Subscriptions", "Entertainment"],
      });
    });

    it("finds exact match", async () => {
      const result = await caller.core.corrections.findMatch({
        description: "NETFLIX",
        minConfidence: 0,
      });

      expect(result.data).not.toBeNull();
      expect(result.data?.descriptionPattern).toBe("NETFLIX");
      expect(result.data?.tags).toEqual(["Subscriptions", "Entertainment"]);
    });

    it("finds contains match", async () => {
      const result = await caller.core.corrections.findMatch({
        description: "WOOLWORTHS SUPERMARKETS AU",
        minConfidence: 0,
      });

      expect(result.data).not.toBeNull();
      expect(result.data?.tags).toContain("Groceries");
    });

    it("returns null when confidence threshold not met", async () => {
      const result = await caller.core.corrections.findMatch({
        description: "NETFLIX",
        minConfidence: 0.99,
      });

      expect(result.data).toBeNull();
      expect(result.status).toBeNull();
    });

    it("returns null for unknown description", async () => {
      const result = await caller.core.corrections.findMatch({
        description: "TOTALLY UNKNOWN MERCHANT XYZ",
        minConfidence: 0,
      });

      expect(result.data).toBeNull();
      expect(result.status).toBeNull();
    });

    it("classifies match as 'uncertain' when confidence < 0.9", async () => {
      // Default confidence is 0.5
      const result = await caller.core.corrections.findMatch({
        description: "NETFLIX",
        minConfidence: 0,
      });

      expect(result.data).not.toBeNull();
      expect(result.status).toBe("uncertain");
    });

    it("classifies match as 'matched' when confidence >= 0.9", async () => {
      // Create a high-confidence correction
      const created = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "SHELL PETROL",
        matchType: "exact",
        tags: ["Transport"],
      });
      await caller.core.corrections.update({
        id: created.data.id,
        data: { confidence: 0.95 },
      });

      const result = await caller.core.corrections.findMatch({
        description: "SHELL PETROL",
        minConfidence: 0,
      });

      expect(result.data).not.toBeNull();
      expect(result.status).toBe("matched");
    });

    it("classifies match at exactly 0.9 as 'matched'", async () => {
      const created = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "COLES",
        matchType: "exact",
        tags: ["Groceries"],
      });
      await caller.core.corrections.update({
        id: created.data.id,
        data: { confidence: 0.9 },
      });

      const result = await caller.core.corrections.findMatch({
        description: "COLES",
        minConfidence: 0,
      });

      expect(result.status).toBe("matched");
    });
  });

  describe("list", () => {
    it("lists all corrections", async () => {
      await caller.core.corrections.createOrUpdate({
        descriptionPattern: "COLES",
        matchType: "contains",
        tags: ["Groceries"],
      });
      await caller.core.corrections.createOrUpdate({
        descriptionPattern: "SPOTIFY",
        matchType: "exact",
        tags: ["Subscriptions"],
      });

      const result = await caller.core.corrections.list({});
      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });

    it("filters by minimum confidence", async () => {
      await caller.core.corrections.createOrUpdate({
        descriptionPattern: "COLES",
        matchType: "contains",
        tags: ["Groceries"],
      });

      const highConfResult = await caller.core.corrections.list({ minConfidence: 0.9 });
      expect(highConfResult.data).toHaveLength(0);

      const lowConfResult = await caller.core.corrections.list({ minConfidence: 0.1 });
      expect(lowConfResult.data).toHaveLength(1);
    });
  });

  describe("previewChangeSet", () => {
    it("previews added rule impact deterministically", async () => {
      const result = await caller.core.corrections.previewChangeSet({
        changeSet: {
          ops: [
            {
              op: "add",
              data: {
                descriptionPattern: "WOOLWORTHS",
                matchType: "contains",
                entityId: null,
                entityName: "Woolworths",
                tags: [],
                transactionType: null,
                confidence: 0.95,
              },
            },
          ],
        },
        transactions: [
          { description: "WOOLWORTHS SUPERMARKETS AU" },
          { description: "TOTALLY UNKNOWN" },
        ],
        minConfidence: 0.7,
      });

      expect(result.summary.total).toBe(2);
      expect(result.summary.newMatches).toBe(1);
      expect(result.diffs[0]?.after.matched).toBe(true);
      expect(result.diffs[0]?.after.ruleId).toMatch(/^temp:/);
      expect(result.diffs[1]?.after.matched).toBe(false);
    });

    it("previews disable removes matches", async () => {
      const created = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "NETFLIX",
        matchType: "exact",
        tags: [],
      });
      await caller.core.corrections.update({ id: created.data.id, data: { confidence: 0.95 } });

      const result = await caller.core.corrections.previewChangeSet({
        changeSet: { ops: [{ op: "disable", id: created.data.id }] },
        transactions: [{ description: "NETFLIX" }],
        minConfidence: 0.7,
      });

      expect(result.summary.removedMatches).toBe(1);
      expect(result.diffs[0]?.before.matched).toBe(true);
      expect(result.diffs[0]?.after.matched).toBe(false);
    });
  });

  describe("applyChangeSet", () => {
    it("applies operations atomically (disable + add)", async () => {
      const created = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "NETFLIX",
        matchType: "exact",
        tags: [],
      });
      await caller.core.corrections.update({ id: created.data.id, data: { confidence: 0.95 } });

      const result = await caller.core.corrections.applyChangeSet({
        changeSet: {
          ops: [
            { op: "disable", id: created.data.id },
            {
              op: "add",
              data: {
                descriptionPattern: "SPOTIFY",
                matchType: "exact",
                tags: [],
                confidence: 0.95,
              },
            },
          ],
        },
      });

      expect(
        result.data.some((r) => r.descriptionPattern === "NETFLIX" && r.isActive === false)
      ).toBe(true);
      expect(result.data.some((r) => r.descriptionPattern === "SPOTIFY")).toBe(true);
    });

    it("rolls back on invalid edit target", async () => {
      // seed a known correction
      await caller.core.corrections.createOrUpdate({
        descriptionPattern: "COLES",
        matchType: "exact",
        tags: [],
      });

      await expect(
        caller.core.corrections.applyChangeSet({
          changeSet: {
            ops: [
              {
                op: "add",
                data: { descriptionPattern: "WOOLWORTHS", matchType: "exact", tags: [] },
              },
              { op: "edit", id: "does-not-exist", data: { confidence: 0.9 } },
            ],
          },
        })
      ).rejects.toThrow();

      // Ensure the add op was not committed due to rollback.
      const list = await caller.core.corrections.list({});
      expect(list.data.some((r) => r.descriptionPattern === "WOOLWORTHS")).toBe(false);
    });
  });

  describe("update", () => {
    it("updates tags on existing correction", async () => {
      const created = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "UBER EATS",
        matchType: "contains",
        tags: ["Dining"],
      });

      const updated = await caller.core.corrections.update({
        id: created.data.id,
        data: { tags: ["Dining", "Online"] },
      });

      expect(updated.data.tags).toEqual(["Dining", "Online"]);
    });

    it("updates confidence", async () => {
      const created = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "AMAZON",
        matchType: "contains",
        tags: ["Shopping"],
      });

      const updated = await caller.core.corrections.update({
        id: created.data.id,
        data: { confidence: 0.9 },
      });

      expect(updated.data.confidence).toBe(0.9);
    });
  });

  describe("delete", () => {
    it("deletes a correction", async () => {
      const created = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "SHELL",
        matchType: "contains",
        tags: ["Transport"],
      });

      await caller.core.corrections.delete({ id: created.data.id });

      const result = await caller.core.corrections.list({});
      expect(result.data).toHaveLength(0);
    });
  });

  describe("adjustConfidence", () => {
    it("increases confidence", async () => {
      const created = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "JB HIFI",
        matchType: "contains",
        tags: ["Shopping"],
      });

      await caller.core.corrections.adjustConfidence({ id: created.data.id, delta: 0.2 });

      const result = await caller.core.corrections.get({ id: created.data.id });
      expect(result.data.confidence).toBeCloseTo(0.7);
    });

    it("deletes correction when confidence drops below 0.3", async () => {
      const created = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "MYSTERY MERCHANT",
        matchType: "exact",
        tags: [],
      });

      await caller.core.corrections.adjustConfidence({ id: created.data.id, delta: -0.3 });

      // Should be deleted since 0.5 - 0.3 = 0.2 < 0.3
      const list = await caller.core.corrections.list({});
      expect(list.data).toHaveLength(0);
    });
  });

  describe("tags integration", () => {
    it("corrections with no tags return empty array", async () => {
      const result = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "TRANSFER",
        matchType: "contains",
        tags: [],
      });

      expect(result.data.tags).toEqual([]);
    });

    it("multiple tags are stored and retrieved correctly", async () => {
      const result = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "MEDICARE",
        matchType: "contains",
        tags: ["Health", "Government", "Tax Deductible"],
      });

      expect(result.data.tags).toHaveLength(3);
      expect(result.data.tags).toContain("Health");
      expect(result.data.tags).toContain("Government");
      expect(result.data.tags).toContain("Tax Deductible");
    });
  });

  describe("entity association", () => {
    it("associates a correction with an entity", async () => {
      const entityId = seedEntity(db, { name: "Woolworths" });

      const result = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "WOOLWORTHS",
        matchType: "contains",
        entityId,
        entityName: "Woolworths",
        tags: ["Groceries"],
      });

      expect(result.data.entityId).toBe(entityId);
      expect(result.data.entityName).toBe("Woolworths");
    });
  });
});
