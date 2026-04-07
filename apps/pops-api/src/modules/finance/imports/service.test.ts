import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  processImport,
  processImportWithProgress,
  executeImport,
  createEntity,
} from "./service.js";
import type { ParsedTransaction, ConfirmedTransaction } from "./types.js";
import { createTestDb, seedEntity, seedTransaction } from "../../../shared/test-utils.js";
import { setDb, closeDb } from "../../../db.js";
import type { Database } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, count } from "drizzle-orm";
import {
  transactions as transactionsTable,
  entities as entitiesTable,
  transactionCorrections,
} from "@pops/db-types";
import { clearCache } from "./lib/ai-categorizer.js";
import { setProgress, getProgress } from "./progress-store.js";

/**
 * Unit tests for import service with SQLite-only writes.
 * ALL tests are 100% offline - zero actual API calls.
 */

// Mock AI categorizer with smart lookup-based responses
vi.mock("./lib/ai-categorizer.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/ai-categorizer.js")>();
  const mock = await import("./lib/ai-categorizer.mock.js");
  return {
    ...actual,
    categorizeWithAi: mock.mockCategorizeWithAi,
  };
});

import { resetMockAi, mockConfig } from "./lib/ai-categorizer.mock.js";

let db: Database;
const orm = () => drizzle(db);

beforeEach(() => {
  db = createTestDb();
  setDb(db);

  resetMockAi();
  clearCache();
});

afterEach(() => {
  closeDb();
});

/** Reused across processImport and suggestedTags test suites */
const baseParsedTransaction: ParsedTransaction = {
  date: "2026-02-13",
  description: "WOOLWORTHS 1234",
  amount: -125.5,
  account: "Amex",
  location: "North Sydney",
  online: false,
  rawRow: '{"Date":"13/02/2026","Description":"WOOLWORTHS 1234"}',
  checksum: "abc123def456",
};

describe("processImport", () => {
  describe("Deduplication", () => {
    it("skips transactions with existing checksums", async () => {
      // Seed a transaction with the same checksum into SQLite
      seedTransaction(db, { checksum: "abc123def456" });

      const result = await processImport([baseParsedTransaction], "Amex");

      expect(result.skipped.length).toBe(1);
      expect(result.skipped[0]!.skipReason).toBe("Duplicate transaction (checksum match)");
      expect(result.matched.length).toBe(0);
      expect(result.uncertain.length).toBe(0);
      expect(result.failed.length).toBe(0);
    });

    it("processes transactions with new checksums", async () => {
      seedEntity(db, { name: "Woolworths", id: "woolworths-id" });

      const result = await processImport([baseParsedTransaction], "Amex");

      expect(result.skipped.length).toBe(0);
      expect(result.matched.length).toBe(1);
      expect(result.matched[0]!.entity.entityName).toBe("Woolworths");
    });

    it("handles large batches without issues", async () => {
      const transactions = Array.from({ length: 250 }, (_, i) => ({
        ...baseParsedTransaction,
        checksum: `checksum-${i}`,
      }));

      // Seed 50 of those as existing to verify partial dedup
      for (let i = 0; i < 50; i++) {
        seedTransaction(db, { checksum: `checksum-${i}` });
      }

      const result = await processImport(transactions, "Amex");

      expect(result.skipped.length).toBe(50);
      // The remaining 200 go to uncertain (no entity match, AI mock returns null by default)
      const total =
        result.skipped.length +
        result.matched.length +
        result.uncertain.length +
        result.failed.length;
      expect(total).toBe(250);
    });

    it("treats transactions as new when no checksums match", async () => {
      seedEntity(db, { name: "Woolworths", id: "woolworths-id" });

      // Seed a transaction with a different checksum
      seedTransaction(db, { checksum: "different-checksum" });

      const result = await processImport([baseParsedTransaction], "Amex");

      // Should not be skipped since checksum doesn't match
      expect(result.matched.length).toBe(1);
    });
  });

  describe("Entity matching", () => {
    it("matches via entity lookup (exact match)", async () => {
      seedEntity(db, { name: "Woolworths", id: "woolworths-id" });

      const result = await processImport([baseParsedTransaction], "Amex");

      expect(result.matched.length).toBe(1);
      expect(result.matched[0]!.entity.entityId).toBe("woolworths-id");
      expect(result.matched[0]!.entity.entityName).toBe("Woolworths");
      expect(result.matched[0]!.entity.matchType).toBe("prefix");
      expect(result.matched[0]!.status).toBe("matched");
    });

    it("matches via alias", async () => {
      seedEntity(db, {
        name: "Transport for NSW",
        id: "transport-nsw-id",
        aliases: "TRANSPORTFORNSWTRAVEL, OPAL",
      });

      const transaction: ParsedTransaction = {
        ...baseParsedTransaction,
        description: "TRANSPORTFORNSWTRAVEL CARD",
        checksum: "xyz789",
      };

      const result = await processImport([transaction], "Amex");

      expect(result.matched.length).toBe(1);
      expect(result.matched[0]!.entity.entityName).toBe("Transport for NSW");
      expect(result.matched[0]!.entity.matchType).toBe("alias");
    });

    it("routes to uncertain when AI returns null (no entity match)", async () => {
      mockConfig.alwaysReturnNull = true;

      const result = await processImport([baseParsedTransaction], "Amex");

      expect(result.uncertain.length).toBe(1);
      expect(result.uncertain[0]!.error).toBe("No entity match found");
      expect(result.failed.length).toBe(0);
    });

    it("throws error when matched entity missing from lookup", async () => {
      // Seed entity but with different name to cause mismatch
      seedEntity(db, { name: "Woolworths Store", id: "woolworths-id" });

      const result = await processImport([baseParsedTransaction], "Amex");

      // With mock AI, pattern matching will catch WOOLWORTHS and return "Grocery Store"
      // This creates an uncertain transaction (new entity suggested)
      expect(result.uncertain.length).toBe(1);
      expect(result.uncertain[0]!.entity.entityName).toBe("Grocery Store");
    });
  });

  describe("AI categorization", () => {
    it("calls AI for unmatched transactions", async () => {
      const rawRow = '{"Date":"13/02/2026","Description":"UNKNOWN MERCHANT"}';
      mockConfig.customLookup = {
        [rawRow.toUpperCase()]: {
          description: "UNKNOWN MERCHANT",
          entityName: "Unknown Merchant",
          category: "Other",
          cachedAt: "2026-02-13T00:00:00Z",
        },
      };

      const transaction: ParsedTransaction = {
        ...baseParsedTransaction,
        description: "UNKNOWN MERCHANT",
        rawRow,
        checksum: "unknown123",
      };

      const result = await processImport([transaction], "Amex");

      expect(result.uncertain.length).toBe(1);
      expect(result.uncertain[0]!.entity.entityName).toBe("Unknown Merchant");
    });

    it("matches AI result to existing entity (case-insensitive)", async () => {
      seedEntity(db, { name: "Woolworths", id: "woolworths-id" });

      const rawRow = '{"Date":"13/02/2026","Description":"UNKNOWN MERCHANT XYZ"}';
      mockConfig.customLookup = {
        [rawRow.toUpperCase()]: {
          description: "UNKNOWN MERCHANT XYZ",
          entityName: "woolworths", // lowercase
          category: "Groceries",
          cachedAt: "2026-02-13T00:00:00Z",
        },
      };

      const transaction: ParsedTransaction = {
        ...baseParsedTransaction,
        description: "UNKNOWN MERCHANT XYZ",
        rawRow,
        checksum: "unknown123",
      };

      const result = await processImport([transaction], "Amex");

      expect(result.matched.length).toBe(1);
      expect(result.matched[0]!.entity.entityName).toBe("Woolworths");
      expect(result.matched[0]!.entity.matchType).toBe("ai");
    });

    it("adds to uncertain when AI suggests new entity", async () => {
      const rawRow = '{"Date":"13/02/2026","Description":"NEW MERCHANT"}';
      mockConfig.customLookup = {
        [rawRow.toUpperCase()]: {
          description: "NEW MERCHANT",
          entityName: "New Merchant",
          category: "Shopping",
          cachedAt: "2026-02-13T00:00:00Z",
        },
      };

      const transaction: ParsedTransaction = {
        ...baseParsedTransaction,
        description: "NEW MERCHANT",
        rawRow,
        checksum: "new123",
      };

      const result = await processImport([transaction], "Amex");

      expect(result.uncertain.length).toBe(1);
      expect(result.uncertain[0]!.entity.entityName).toBe("New Merchant");
      expect(result.uncertain[0]!.entity.confidence).toBe(0.7);
      expect(result.uncertain[0]!.status).toBe("uncertain");
    });

    it("routes to uncertain when AI returns null", async () => {
      mockConfig.alwaysReturnNull = true;

      const transaction: ParsedTransaction = {
        ...baseParsedTransaction,
        description: "FAILED MERCHANT",
        checksum: "failed123",
      };

      const result = await processImport([transaction], "Amex");

      expect(result.uncertain.length).toBe(1);
      expect(result.uncertain[0]!.error).toBe("No entity match found");
      expect(result.failed.length).toBe(0);
    });
  });

  describe("Error handling", () => {
    it("routes to uncertain when AI throws (unavailable)", async () => {
      // AI failure is not a hard transaction error — routes to uncertain for human review
      mockConfig.throwError = true;
      mockConfig.errorType = "API_ERROR";

      const transaction: ParsedTransaction = {
        ...baseParsedTransaction,
        description: "ERROR MERCHANT",
        checksum: "error123",
      };

      const result = await processImport([transaction], "Amex");

      expect(result.uncertain.length).toBe(1);
      expect(result.uncertain[0]!.error).toBe("AI categorization unavailable");
      expect(result.failed.length).toBe(0);
    });

    it("handles mixed: one matched, one routed to uncertain when AI unavailable", async () => {
      seedEntity(db, { name: "Woolworths", id: "woolworths-id" });
      mockConfig.alwaysReturnNull = true;

      const transactions: ParsedTransaction[] = [
        baseParsedTransaction, // Will match Woolworths
        { ...baseParsedTransaction, description: "UNKNOWN", checksum: "unknown123" }, // AI null -> uncertain
      ];

      const result = await processImport(transactions, "Amex");

      expect(result.matched.length).toBe(1);
      expect(result.uncertain.length).toBe(1);
      expect(result.failed.length).toBe(0);
    });
  });

  describe("Edge cases", () => {
    it("returns empty results for empty input", async () => {
      const result = await processImport([], "Amex");

      expect(result.matched).toEqual([]);
      expect(result.uncertain).toEqual([]);
      expect(result.failed).toEqual([]);
      expect(result.skipped).toEqual([]);
    });

    it("handles transactions with missing optional fields", async () => {
      seedEntity(db, { name: "Woolworths", id: "woolworths-id" });

      const transaction: ParsedTransaction = {
        date: "2026-02-13",
        description: "WOOLWORTHS",
        amount: -100,
        account: "Amex",
        rawRow: "{}",
        checksum: "minimal123",
      };

      const result = await processImport([transaction], "Amex");

      expect(result.matched.length).toBe(1);
      expect(result.matched[0]!.location).toBeUndefined();
      expect(result.matched[0]!.online).toBeUndefined();
    });
  });
});

describe("suggestedTags", () => {
  it("includes empty suggestedTags array on matched transactions when no tags exist", async () => {
    seedEntity(db, { name: "Woolworths", id: "woolworths-id" });

    const result = await processImport([baseParsedTransaction], "Amex");

    expect(result.matched.length).toBe(1);
    expect(Array.isArray(result.matched[0]!.suggestedTags)).toBe(true);
  });

  it("includes entity default_tags as source='entity'", async () => {
    seedEntity(db, {
      name: "Woolworths",
      id: "woolworths-id",
      default_tags: '["Groceries"]',
    });

    const result = await processImport([baseParsedTransaction], "Amex");

    const tags = result.matched[0]!.suggestedTags ?? [];
    expect(tags).toContainEqual({ tag: "Groceries", source: "entity" });
  });

  it("matches AI category to an existing tag (source='ai')", async () => {
    // Seed a transaction with "Groceries" tag so the AI match lookup finds it
    seedTransaction(db, { tags: '["Groceries"]' });

    const rawRow = '{"Date":"13/02/2026","Description":"UNKNOWN STORE XYZ"}';
    mockConfig.customLookup = {
      [rawRow.toUpperCase()]: {
        description: "UNKNOWN STORE XYZ",
        entityName: "Unknown Store",
        category: "groceries", // intentionally lowercase to test case-insensitive match
        cachedAt: "2026-02-13T00:00:00Z",
      },
    };

    const transaction: ParsedTransaction = {
      ...baseParsedTransaction,
      description: "UNKNOWN STORE XYZ",
      rawRow,
      checksum: "aitest123",
    };

    const result = await processImport([transaction], "Amex");

    // Goes to uncertain (AI suggested new entity "Unknown Store")
    const tags = result.uncertain[0]?.suggestedTags ?? [];
    expect(tags).toContainEqual({ tag: "Groceries", source: "ai" });
  });

  it("includes correction rule tags as source='rule'", async () => {
    seedEntity(db, { name: "Woolworths", id: "woolworths-id" });
    // Seed a correction that matches the description (entity must exist first -- FK constraint)
    orm()
      .insert(transactionCorrections)
      .values({
        id: "corr-1",
        descriptionPattern: "woolworths",
        matchType: "contains",
        entityId: "woolworths-id",
        entityName: "Woolworths",
        tags: '["Groceries","Weekly Shop"]',
        confidence: 0.95,
      })
      .run();

    const result = await processImport([baseParsedTransaction], "Amex");

    // Correction takes priority -- lands in matched
    const tags = result.matched[0]?.suggestedTags ?? [];
    // Use objectContaining since rule-sourced tags now include `pattern`
    expect(tags).toContainEqual(
      expect.objectContaining({ tag: "Groceries", source: "rule", pattern: "woolworths" })
    );
    expect(tags).toContainEqual(
      expect.objectContaining({ tag: "Weekly Shop", source: "rule", pattern: "woolworths" })
    );
  });

  it("does not duplicate tags when correction and entity both suggest the same tag", async () => {
    seedEntity(db, {
      name: "Woolworths",
      id: "woolworths-id",
      default_tags: '["Groceries"]', // same tag as correction
    });
    // Entity must exist before inserting correction (FK constraint)
    orm()
      .insert(transactionCorrections)
      .values({
        id: "corr-2",
        descriptionPattern: "woolworths",
        matchType: "contains",
        entityId: "woolworths-id",
        entityName: "Woolworths",
        tags: '["Groceries"]',
        confidence: 0.95,
      })
      .run();

    const result = await processImport([baseParsedTransaction], "Amex");

    const tags = result.matched[0]?.suggestedTags ?? [];
    const groceriesTags = tags.filter((t) => t.tag === "Groceries");
    expect(groceriesTags.length).toBe(1);
  });
});

describe("processImportWithProgress", () => {
  it("applies learned corrections first and skips subsequent matching stages", async () => {
    seedEntity(db, { name: "Woolworths", id: "woolworths-id" });
    orm()
      .insert(transactionCorrections)
      .values({
        id: "corr-progress-1",
        descriptionPattern: "woolworths",
        matchType: "contains",
        entityId: "woolworths-id",
        entityName: "Woolworths",
        tags: '["Groceries","Weekly Shop"]',
        confidence: 0.95,
      })
      .run();

    // If AI were called, this would throw and we'd fail the test.
    mockConfig.throwError = true;
    mockConfig.errorType = "API_ERROR";

    const sessionId = "11111111-1111-1111-1111-111111111111";
    setProgress(sessionId, {
      sessionId,
      status: "processing",
      currentStep: "deduplicating",
      totalTransactions: 1,
      processedCount: 0,
      currentBatch: [],
      errors: [],
      startedAt: new Date().toISOString(),
    });

    await processImportWithProgress(sessionId, [baseParsedTransaction], "Amex");

    const progress = getProgress(sessionId);
    expect(progress?.status).toBe("completed");
    expect(progress?.result).toBeDefined();

    const result = progress?.result as Awaited<ReturnType<typeof processImport>>;
    expect(result.matched.length).toBe(1);
    expect(result.matched[0]!.entity.matchType).toBe("learned");

    const tags = result.matched[0]!.suggestedTags ?? [];
    expect(tags).toContainEqual(
      expect.objectContaining({ tag: "Groceries", source: "rule", pattern: "woolworths" })
    );
  });

  it("falls through to entity matching when correction matches without entityId", async () => {
    seedEntity(db, { name: "Woolworths", id: "woolworths-id" });
    orm()
      .insert(transactionCorrections)
      .values({
        id: "corr-progress-no-entity",
        descriptionPattern: "woolworths",
        matchType: "contains",
        entityId: null,
        entityName: "Woolworths",
        tags: '["Groceries"]',
        confidence: 0.95,
      })
      .run();

    const sessionId = "22222222-2222-2222-2222-222222222222";
    setProgress(sessionId, {
      sessionId,
      status: "processing",
      currentStep: "deduplicating",
      totalTransactions: 1,
      processedCount: 0,
      currentBatch: [],
      errors: [],
      startedAt: new Date().toISOString(),
    });

    await processImportWithProgress(sessionId, [baseParsedTransaction], "Amex");

    const progress = getProgress(sessionId);
    const result = progress?.result as Awaited<ReturnType<typeof processImport>>;
    expect(result.matched.length).toBe(1);
    expect(result.matched[0]!.entity.matchType).toBe("prefix");
  });

  it("routes low-confidence corrections to uncertain", async () => {
    seedEntity(db, { name: "Woolworths", id: "woolworths-id" });
    orm()
      .insert(transactionCorrections)
      .values({
        id: "corr-progress-low-confidence",
        descriptionPattern: "woolworths",
        matchType: "contains",
        entityId: "woolworths-id",
        entityName: "Woolworths",
        tags: '["Groceries"]',
        confidence: 0.8,
      })
      .run();

    const sessionId = "33333333-3333-3333-3333-333333333333";
    setProgress(sessionId, {
      sessionId,
      status: "processing",
      currentStep: "deduplicating",
      totalTransactions: 1,
      processedCount: 0,
      currentBatch: [],
      errors: [],
      startedAt: new Date().toISOString(),
    });

    await processImportWithProgress(sessionId, [baseParsedTransaction], "Amex");

    const progress = getProgress(sessionId);
    const result = progress?.result as Awaited<ReturnType<typeof processImport>>;
    expect(result.uncertain.length).toBe(1);
    expect(result.uncertain[0]!.entity.matchType).toBe("learned");
    expect(result.matched.length).toBe(0);
  });

  it("handles mixed batch independently (one correction match, one normal match)", async () => {
    seedEntity(db, { name: "Woolworths", id: "woolworths-id" });
    seedEntity(db, { name: "Netflix", id: "netflix-id" });
    orm()
      .insert(transactionCorrections)
      .values({
        id: "corr-progress-mixed",
        descriptionPattern: "woolworths",
        matchType: "contains",
        entityId: "woolworths-id",
        entityName: "Woolworths",
        tags: "[]",
        confidence: 0.95,
      })
      .run();

    const sessionId = "44444444-4444-4444-4444-444444444444";
    setProgress(sessionId, {
      sessionId,
      status: "processing",
      currentStep: "deduplicating",
      totalTransactions: 2,
      processedCount: 0,
      currentBatch: [],
      errors: [],
      startedAt: new Date().toISOString(),
    });

    const t2: ParsedTransaction = {
      ...baseParsedTransaction,
      description: "NETFLIX.COM SUBSCRIPTION",
      rawRow: '{"Date":"13/02/2026","Description":"NETFLIX.COM SUBSCRIPTION"}',
      checksum: "netflix-123",
    };

    await processImportWithProgress(sessionId, [baseParsedTransaction, t2], "Amex");

    const progress = getProgress(sessionId);
    const result = progress?.result as Awaited<ReturnType<typeof processImport>>;
    expect(result.matched.length).toBe(2);
    expect(result.matched.some((t) => t.entity.matchType === "learned")).toBe(true);
    expect(result.matched.some((t) => t.entity.matchType === "prefix")).toBe(true);
  });
});

describe("executeImport", () => {
  const baseConfirmedTransaction: ConfirmedTransaction = {
    date: "2026-02-13",
    description: "WOOLWORTHS 1234",
    amount: -125.5,
    account: "Amex",
    location: "North Sydney",
    online: false,
    rawRow: '{"Date":"13/02/2026"}',
    checksum: "abc123",
    entityId: "woolworths-id",
    entityName: "Woolworths",
  };

  beforeEach(() => {
    // FK constraint on entity_id requires entity to exist before inserting transactions
    seedEntity(db, { name: "Woolworths", id: "woolworths-id" });
  });

  it("returns empty result for empty input", () => {
    const result = executeImport([]);

    expect(result.imported).toBe(0);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toBe(0);
  });

  it("writes single transaction to SQLite", () => {
    const result = executeImport([baseConfirmedTransaction]);

    expect(result.imported).toBe(1);
    expect(result.failed).toEqual([]);

    // Verify the row exists in SQLite
    const rows = orm()
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.checksum, "abc123"))
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.description).toBe("WOOLWORTHS 1234");
    expect(rows[0]!.amount).toBe(-125.5);
    expect(rows[0]!.account).toBe("Amex");
  });

  it("writes multiple transactions", () => {
    const transactions = Array.from({ length: 10 }, (_, i) => ({
      ...baseConfirmedTransaction,
      checksum: `checksum-${i}`,
    }));

    const result = executeImport(transactions);

    expect(result.imported).toBe(10);

    // Verify all rows in SQLite
    const [row] = orm().select({ cnt: count() }).from(transactionsTable).all();
    expect(row!.cnt).toBe(10);
  });

  it("returns pageId in successful results", () => {
    const result = executeImport([baseConfirmedTransaction]);

    expect(result.imported).toBe(1);
    expect(result.failed).toEqual([]);

    // Verify the transaction was inserted with a UUID
    const row = orm()
      .select({ id: transactionsTable.id })
      .from(transactionsTable)
      .where(eq(transactionsTable.checksum, "abc123"))
      .get();
    expect(row).toBeDefined();
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
  });

  it("stores tags as JSON in SQLite", () => {
    const transaction: ConfirmedTransaction = {
      ...baseConfirmedTransaction,
      tags: ["Groceries", "Weekly Shop"],
    };
    executeImport([transaction]);

    const row = orm()
      .select({ tags: transactionsTable.tags })
      .from(transactionsTable)
      .where(eq(transactionsTable.checksum, "abc123"))
      .get();
    expect(JSON.parse(row!.tags)).toEqual(["Groceries", "Weekly Shop"]);
  });

  it("defaults to empty tags when not provided", () => {
    executeImport([baseConfirmedTransaction]); // tags field absent

    const row = orm()
      .select({ tags: transactionsTable.tags })
      .from(transactionsTable)
      .where(eq(transactionsTable.checksum, "abc123"))
      .get();
    expect(JSON.parse(row!.tags)).toEqual([]);
  });

  it("stores location when present", () => {
    executeImport([baseConfirmedTransaction]);

    const row = orm()
      .select({ location: transactionsTable.location })
      .from(transactionsTable)
      .where(eq(transactionsTable.checksum, "abc123"))
      .get();
    expect(row!.location).toBe("North Sydney");
  });

  it("stores null location when undefined", () => {
    const transaction = {
      ...baseConfirmedTransaction,
      location: undefined,
      checksum: "no-loc-123",
    };
    executeImport([transaction]);

    const row = orm()
      .select({ location: transactionsTable.location })
      .from(transactionsTable)
      .where(eq(transactionsTable.checksum, "no-loc-123"))
      .get();
    expect(row!.location).toBeNull();
  });

  it("stores rawRow in SQLite", () => {
    executeImport([baseConfirmedTransaction]);

    const row = orm()
      .select({ rawRow: transactionsTable.rawRow })
      .from(transactionsTable)
      .where(eq(transactionsTable.checksum, "abc123"))
      .get();
    expect(row!.rawRow).toBe('{"Date":"13/02/2026"}');
  });

  it("stores entity_id and entity_name in SQLite", () => {
    executeImport([baseConfirmedTransaction]);

    const row = orm()
      .select({ entityId: transactionsTable.entityId, entityName: transactionsTable.entityName })
      .from(transactionsTable)
      .where(eq(transactionsTable.checksum, "abc123"))
      .get();
    expect(row!.entityId).toBe("woolworths-id");
    expect(row!.entityName).toBe("Woolworths");
  });

  it("handles large batch (30 transactions)", () => {
    const transactions = Array.from({ length: 30 }, (_, i) => ({
      ...baseConfirmedTransaction,
      checksum: `checksum-${i}`,
    }));

    const result = executeImport(transactions);

    expect(result.imported).toBe(30);

    const [row] = orm().select({ cnt: count() }).from(transactionsTable).all();
    expect(row!.cnt).toBe(30);
  });

  it("sets entity_id to NULL when referenced entity is deleted (ON DELETE SET NULL)", () => {
    executeImport([baseConfirmedTransaction]);

    // Verify entity_id is set before deletion
    const before = orm()
      .select({ entityId: transactionsTable.entityId })
      .from(transactionsTable)
      .where(eq(transactionsTable.checksum, "abc123"))
      .get();
    expect(before!.entityId).toBe("woolworths-id");

    // Delete the entity — FK SET NULL should nullify entity_id
    orm().delete(entitiesTable).where(eq(entitiesTable.id, "woolworths-id")).run();

    const after = orm()
      .select({ entityId: transactionsTable.entityId })
      .from(transactionsTable)
      .where(eq(transactionsTable.checksum, "abc123"))
      .get();
    expect(after!.entityId).toBeNull();
  });
});

describe("createEntity", () => {
  it("creates entity in SQLite", () => {
    const result = createEntity("New Entity");

    expect(result.entityId).toBeDefined();
    expect(result.entityId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    expect(result.entityName).toBe("New Entity");

    // Verify SQLite insert
    const row = orm()
      .select()
      .from(entitiesTable)
      .where(eq(entitiesTable.id, result.entityId))
      .get();
    expect(row!.name).toBe("New Entity");
  });

  it("handles entity name with special characters", () => {
    const result = createEntity("McDonald's");

    expect(result.entityName).toBe("McDonald's");

    const row = orm()
      .select({ name: entitiesTable.name })
      .from(entitiesTable)
      .where(eq(entitiesTable.id, result.entityId))
      .get();
    expect(row!.name).toBe("McDonald's");
  });

  it("handles very long entity name (200 chars)", () => {
    const longName = "A".repeat(200);
    const result = createEntity(longName);

    expect(result.entityName).toBe(longName);
  });

  it("generates unique IDs for each entity", () => {
    const result1 = createEntity("Entity One");
    const result2 = createEntity("Entity Two");

    expect(result1.entityId).not.toBe(result2.entityId);

    const [result] = orm().select({ cnt: count() }).from(entitiesTable).all();
    expect(result!.cnt).toBe(2);
  });

  it("sets current timestamp for last_edited_time", () => {
    const before = new Date().toISOString();
    const result = createEntity("Test Entity");
    const after = new Date().toISOString();

    const row = orm()
      .select({ lastEditedTime: entitiesTable.lastEditedTime })
      .from(entitiesTable)
      .where(eq(entitiesTable.id, result.entityId))
      .get();
    expect(row!.lastEditedTime >= before).toBe(true);
    expect(row!.lastEditedTime <= after).toBe(true);
  });
});

describe("loadEntityLookup", () => {
  it("returns empty object when no entities exist", async () => {
    const result = await processImport([], "Amex");

    // Should not crash with empty lookup
    expect(result).toBeDefined();
  });

  it("returns correct name->id mapping", async () => {
    seedEntity(db, { name: "Woolworths", id: "woolworths-id" });
    seedEntity(db, { name: "Coles", id: "coles-id" });

    const transaction: ParsedTransaction = {
      date: "2026-02-13",
      description: "WOOLWORTHS",
      amount: -100,
      account: "Amex",
      rawRow: "{}",
      checksum: "abc123",
    };

    const result = await processImport([transaction], "Amex");

    expect(result.matched[0]!.entity.entityId).toBe("woolworths-id");
  });

  it("handles entity with empty id gracefully", async () => {
    orm()
      .insert(entitiesTable)
      .values({
        id: "",
        name: "Invalid Entity",
        lastEditedTime: "2026-01-01T00:00:00Z",
      })
      .run();

    // Should not crash when entity lookup encounters an empty-string id
    const result = await processImport([], "Amex");
    expect(result).toBeDefined();
  });
});

describe("loadAliases", () => {
  it("returns empty object when no aliases exist", async () => {
    seedEntity(db, { name: "Woolworths", id: "woolworths-id", aliases: null });

    // Should not crash
    const result = await processImport([], "Amex");
    expect(result).toBeDefined();
  });

  it("parses comma-separated aliases correctly", async () => {
    seedEntity(db, {
      name: "Transport for NSW",
      id: "transport-id",
      aliases: "TRANSPORTFORNSWTRAVEL, OPAL, TfNSW",
    });

    const transaction: ParsedTransaction = {
      date: "2026-02-13",
      description: "OPAL CARD",
      amount: -10,
      account: "Amex",
      rawRow: "{}",
      checksum: "opal123",
    };

    const result = await processImport([transaction], "Amex");

    expect(result.matched[0]!.entity.entityName).toBe("Transport for NSW");
    expect(result.matched[0]!.entity.matchType).toBe("alias");
  });

  it("trims whitespace from aliases", async () => {
    seedEntity(db, {
      name: "Woolworths",
      id: "woolworths-id",
      aliases: "  WOW  ,  WOOLIES  ",
    });

    const transaction: ParsedTransaction = {
      date: "2026-02-13",
      description: "WOW METRO",
      amount: -50,
      account: "Amex",
      rawRow: "{}",
      checksum: "wow123",
    };

    const result = await processImport([transaction], "Amex");

    expect(result.matched[0]!.entity.matchType).toBe("alias");
  });

  it("handles single alias (no commas)", async () => {
    seedEntity(db, {
      name: "Netflix",
      id: "netflix-id",
      aliases: "NETFLIX.COM",
    });

    const transaction: ParsedTransaction = {
      date: "2026-02-13",
      description: "NETFLIX.COM SUBSCRIPTION",
      amount: -15.99,
      account: "Amex",
      rawRow: "{}",
      checksum: "netflix123",
    };

    const result = await processImport([transaction], "Amex");

    expect(result.matched[0]!.entity.matchType).toBe("alias");
  });

  it("handles empty string aliases", async () => {
    seedEntity(db, { name: "Test", id: "test-id", aliases: "" });

    // Should not crash
    const result = await processImport([], "Amex");
    expect(result).toBeDefined();
  });
});
