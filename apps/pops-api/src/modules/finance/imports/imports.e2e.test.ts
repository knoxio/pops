import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import Papa from "papaparse";
import type { Database } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, count, isNull } from "drizzle-orm";
import { transactions as transactionsTable } from "@pops/db-types";
import {
  seedEntity,
  seedTransaction,
  createCaller,
  createTestDb,
} from "../../../shared/test-utils.js";
import { transformAmex } from "./transformers/amex.js";
import { clearCache } from "./lib/ai-categorizer.js";
import type { ConfirmedTransaction, ProcessImportOutput, ExecuteImportOutput } from "./types.js";

/**
 * E2E Integration Test for Complete Import Flow
 *
 * Tests the entire import pipeline from CSV to SQLite with:
 * - Real CSV parsing (using test data)
 * - Real transformer functions
 * - Real entity matching (with seeded data)
 * - Real SQLite writes (in-memory test DB)
 * - Mocked AI categorization (100% offline)
 *
 * NO external API calls - fully reproducible.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
import { setDb, closeDb } from "../../../db.js";

let caller: ReturnType<typeof createCaller>;
let db: Database;
const orm = () => drizzle(db);

/**
 * Helper to poll for import progress until completion
 */
async function waitForCompletion<T extends ProcessImportOutput | ExecuteImportOutput>(
  sessionId: string,
  maxAttempts = 100
): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    const progress = await caller.finance.imports.getImportProgress({ sessionId });
    if (!progress) {
      throw new Error("Progress not found");
    }
    if (progress.status === "completed") {
      if (!progress.result) throw new Error("Import completed but result is missing");
      return progress.result as T;
    }
    if (progress.status === "failed") {
      throw new Error(`Import failed: ${progress.errors?.map((e) => e.error).join(", ")}`);
    }
    // Wait 10ms before next poll
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timeout waiting for import to complete");
}

beforeEach(() => {
  db = createTestDb();
  setDb(db);
  caller = createCaller(true);

  resetMockAi();
  clearCache();
});

afterEach(() => {
  closeDb();
});

describe("E2E: Complete Import Flow", () => {
  it("imports Amex CSV end-to-end", async () => {
    // Step 0: Seed test entities in database
    seedEntity(db, {
      name: "Woolworths",
      id: "woolworths-id-123",
      aliases: "WW, WOOLIES",
    });
    seedEntity(db, {
      name: "Coles",
      id: "coles-id-456",
    });
    seedEntity(db, {
      name: "Netflix",
      id: "netflix-id-789",
    });
    seedEntity(db, {
      name: "Transport for NSW",
      id: "transport-nsw-id-abc",
      aliases: "TRANSPORTFORNSWTRAVEL, OPAL",
    });
    seedEntity(db, {
      name: "Roastville",
      id: "roastville-id-def",
    });

    // Step 1: Load and parse test CSV with proper CSV parser
    const csvPath = join(__dirname, "test-data", "amex-sample.csv");
    const csvContent = readFileSync(csvPath, "utf-8");

    // Parse CSV with papaparse (handles quoted fields, multiline, commas in fields)
    const parseResult = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
    });

    expect(parseResult.errors.length).toBe(0); // No CSV parsing errors
    const rows = parseResult.data as Record<string, string>[];

    // Step 2: Transform CSV rows
    const parsed = rows.map((row) => transformAmex(row));

    expect(parsed.length).toBe(10); // 10 transactions in CSV
    expect(parsed[0]!.date).toBe("2026-02-13");
    expect(parsed[0]!.amount).toBe(-125.5); // Inverted

    // Step 3: Seed an existing transaction to simulate 1 duplicate (row 7 is duplicate of row 1)
    const existingChecksum = parsed[6]!.checksum; // 7th row (duplicate)
    seedTransaction(db, { checksum: existingChecksum });

    // Step 4: Process import (dedup + entity match)
    const { sessionId: processSessionId } = await caller.finance.imports.processImport({
      transactions: parsed,
      account: "Amex",
    });

    const processed = await waitForCompletion<ProcessImportOutput>(processSessionId);
    expect(processed).toBeDefined();

    // Verify categorization results
    expect(processed.matched.length).toBeGreaterThan(0);
    expect(processed.skipped.length).toBe(1); // 1 duplicate
    expect(processed.uncertain.length).toBeGreaterThanOrEqual(1); // AI suggested new entity

    // Verify specific matches
    const woolworthsMatch = processed.matched.find((t) => t.description.includes("WOOLWORTHS"));
    expect(woolworthsMatch?.entity.entityName).toBe("Woolworths");
    expect(woolworthsMatch?.entity.matchType).toBe("prefix");

    const transportMatch = processed.matched.find((t) =>
      t.description.includes("TRANSPORTFORNSWTRAVEL")
    );
    expect(transportMatch?.entity.entityName).toBe("Transport for NSW");
    expect(transportMatch?.entity.matchType).toBe("alias");

    const netflixMatch = processed.matched.find((t) => t.description.includes("NETFLIX"));
    expect(netflixMatch?.entity.entityName).toBe("Netflix");
    expect(netflixMatch?.entity.matchType).toBe("contains");

    // Step 5: Manually resolve uncertain transactions
    const confirmed: ConfirmedTransaction[] = [
      ...processed.matched.map((t) => ({
        date: t.date,
        description: t.description,
        amount: t.amount,
        account: t.account,
        location: t.location,
        rawRow: t.rawRow,
        checksum: t.checksum,
        entityId: t.entity.entityId ?? "",
        entityName: t.entity.entityName ?? "",
      })),
    ];

    expect(confirmed.length).toBeGreaterThan(0);

    // Step 6: Execute import (write to SQLite)
    const { sessionId: executeSessionId } = await caller.finance.imports.executeImport({
      transactions: confirmed,
    });

    const result = await waitForCompletion<ExecuteImportOutput>(executeSessionId, 500);
    expect(result).toBeDefined();

    // Step 7: Verify results
    expect(result.imported).toBe(confirmed.length);
    expect(result.failed.length).toBe(0);

    // Verify rows were written to SQLite (excluding the 1 seeded duplicate)
    const [transactionCount] = orm().select({ cnt: count() }).from(transactionsTable).all();
    // 1 seeded duplicate + confirmed.length newly imported
    expect(transactionCount!.cnt).toBe(1 + confirmed.length);

    // Verify data integrity of a specific row
    if (woolworthsMatch) {
      const row = orm()
        .select()
        .from(transactionsTable)
        .where(eq(transactionsTable.checksum, woolworthsMatch.checksum))
        .get();
      expect(row).toBeDefined();
      expect(row?.description).toBe(woolworthsMatch.description);
      expect(row?.entityName).toBe("Woolworths");
      expect(row?.account).toBe("Amex");
    }
  }, 30000); // 30 second timeout

  it("imports a unique transaction alongside existing data", async () => {
    // Seed an existing transaction, then verify a new unique one succeeds
    seedTransaction(db, { checksum: "test123" });
    seedEntity(db, { name: "Entity", id: "entity-id" });

    const mockTransaction: ConfirmedTransaction = {
      date: "2026-02-13",
      description: "TEST",
      amount: -100,
      account: "Amex",
      rawRow: "{}",
      checksum: "unique-test-456",
      entityId: "entity-id",
      entityName: "Entity",
    };

    const { sessionId } = await caller.finance.imports.executeImport({
      transactions: [mockTransaction],
    });

    const result = await waitForCompletion<ExecuteImportOutput>(sessionId);
    expect(result).toBeDefined();

    expect(result.imported).toBe(1);
    expect(result.failed.length).toBe(0);
  }, 10000);

  it("rejects duplicate checksum on insert (UNIQUE constraint)", async () => {
    seedTransaction(db, { checksum: "duplicate-checksum" });

    const duplicate: ConfirmedTransaction = {
      date: "2026-02-14",
      description: "DUPLICATE TXN",
      amount: -50,
      account: "Amex",
      rawRow: "{}",
      checksum: "duplicate-checksum",
      entityId: "entity-id",
      entityName: "Entity",
    };

    const { sessionId } = await caller.finance.imports.executeImport({
      transactions: [duplicate],
    });

    const result = await waitForCompletion<ExecuteImportOutput>(sessionId);
    expect(result).toBeDefined();

    expect(result.imported).toBe(0);
    expect(result.failed.length).toBe(1);
    expect(result.failed[0]!.error).toMatch(/UNIQUE constraint/i);
  }, 10000);

  it("allows multiple NULL checksums (no UNIQUE violation at DB layer)", () => {
    // SQLite UNIQUE index treats each NULL as distinct, so multiple
    // NULL-checksum rows should coexist without constraint errors
    seedTransaction(db, { checksum: undefined });
    seedTransaction(db, { checksum: undefined });

    const [result] = orm()
      .select({ cnt: count() })
      .from(transactionsTable)
      .where(isNull(transactionsTable.checksum))
      .all();

    expect(result!.cnt).toBe(2);
  });

  it("deduplicates correctly across multiple imports", async () => {
    seedEntity(db, { name: "Woolworths", id: "woolworths-id" });

    const transaction = {
      date: "2026-02-13",
      description: "WOOLWORTHS 1234",
      amount: -125.5,
      account: "Amex",
      location: "Sydney",
      rawRow: '{"test": "data"}',
      checksum: "unique-checksum-123",
    };

    // First import - no duplicates
    const { sessionId: sid1 } = await caller.finance.imports.processImport({
      transactions: [transaction],
      account: "Amex",
    });

    const result1 = await waitForCompletion<ProcessImportOutput>(sid1);
    expect(result1).toBeDefined();

    expect(result1.matched.length).toBe(1);
    expect(result1.skipped.length).toBe(0);

    // Execute the first import to write to SQLite
    const confirmed: ConfirmedTransaction = {
      ...transaction,
      entityId: result1.matched[0]!.entity.entityId ?? "",
      entityName: result1.matched[0]!.entity.entityName ?? "",
    };

    const { sessionId: execSid } = await caller.finance.imports.executeImport({
      transactions: [confirmed],
    });
    await waitForCompletion<ExecuteImportOutput>(execSid, 500);

    // Second import - checksum now exists in SQLite
    const { sessionId: sid2 } = await caller.finance.imports.processImport({
      transactions: [transaction],
      account: "Amex",
    });

    const result2 = await waitForCompletion<ProcessImportOutput>(sid2);
    expect(result2).toBeDefined();

    expect(result2.matched.length).toBe(0);
    expect(result2.skipped.length).toBe(1);
    expect(result2.skipped[0]!.skipReason).toContain("Duplicate");
  });

  it("handles mixed transaction types in single batch", async () => {
    seedEntity(db, { name: "Woolworths", id: "woolworths-id" });

    // Mock AI to return null -- unknown transaction routes to uncertain (needs human review)
    mockConfig.alwaysReturnNull = true;

    const transactions = [
      {
        // Will match
        date: "2026-02-13",
        description: "WOOLWORTHS 1234",
        amount: -100,
        account: "Amex",
        rawRow: "{}",
        checksum: "match123",
      },
      {
        // Will fail (unknown)
        date: "2026-02-14",
        description: "UNKNOWN MERCHANT",
        amount: -50,
        account: "Amex",
        rawRow: "{}",
        checksum: "unknown123",
      },
    ];

    const { sessionId } = await caller.finance.imports.processImport({
      transactions,
      account: "Amex",
    });

    const result = await waitForCompletion<ProcessImportOutput>(sessionId);
    expect(result).toBeDefined();

    expect(result.matched.length).toBe(1);
    expect(result.uncertain.length).toBe(1);
    expect(result.failed.length).toBe(0);
  });

  it("preserves transaction data through complete pipeline", async () => {
    seedEntity(db, { name: "Woolworths", id: "woolworths-id" });

    const originalTransaction = {
      date: "2026-02-13",
      description: "WOOLWORTHS 1234",
      amount: -125.5,
      account: "Amex",
      location: "North Sydney",
      rawRow: '{"original": "data"}',
      checksum: "preserve123",
    };

    // Process
    const { sessionId: processSessionId } = await caller.finance.imports.processImport({
      transactions: [originalTransaction],
      account: "Amex",
    });

    const processed = await waitForCompletion<ProcessImportOutput>(processSessionId);
    expect(processed).toBeDefined();

    // Convert to confirmed
    const matchedRow = processed.matched[0]!;
    const confirmed: ConfirmedTransaction = {
      ...matchedRow,
      entityId: matchedRow.entity.entityId ?? "",
      entityName: matchedRow.entity.entityName ?? "",
    };

    // Execute
    const { sessionId: executeSessionId } = await caller.finance.imports.executeImport({
      transactions: [confirmed],
    });

    await waitForCompletion<ExecuteImportOutput>(executeSessionId, 500);

    // Verify data preservation in SQLite
    const row = orm()
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.checksum, "preserve123"))
      .get();

    expect(row).toBeDefined();
    expect(row?.description).toBe("WOOLWORTHS 1234");
    expect(row?.amount).toBe(-125.5);
    expect(row?.date).toBe("2026-02-13");
    expect(row?.location).toBe("North Sydney");
    expect(JSON.parse(row?.tags ?? "[]")).toEqual([]);
    expect(row?.checksum).toBe("preserve123");
  }, 10000);
});

describe("E2E: CSV Transformer Accuracy", () => {
  it("correctly parses Amex CSV format", () => {
    const row = {
      Date: "13/02/2026",
      Description: "WOOLWORTHS  1234",
      Amount: "125.50",
      "Town/City": "NORTH SYDNEY\nNSW",
      Country: "AUSTRALIA",
    };

    const result = transformAmex(row);

    expect(result.date).toBe("2026-02-13");
    expect(result.description).toBe("WOOLWORTHS 1234"); // Double space removed
    expect(result.amount).toBe(-125.5); // Inverted
    expect(result.account).toBe("Amex");
    expect(result.location).toBe("North Sydney"); // Title-cased, first line only
    expect(result.checksum).toHaveLength(64); // SHA-256
    expect(result.rawRow).toBe(JSON.stringify(row));
  });

  it("handles refunds (negative amounts)", () => {
    const row = {
      Date: "13/02/2026",
      Description: "REFUND WOOLWORTHS",
      Amount: "-50.00",
    };

    const result = transformAmex(row);

    expect(result.amount).toBe(50.0); // Inverted (negative becomes positive)
  });
});
